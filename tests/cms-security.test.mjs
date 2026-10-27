import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accessConfigFromEnv,
  createCsrfToken,
  requireWriteAuth,
  verifyAccessRequest,
  verifyCsrfToken,
} from "../src/lib/cms/auth.ts";
import { CmsError } from "../src/lib/cms/errors.ts";
import { ADMIN_CSP, readFormData } from "../src/lib/cms/http.ts";
import { inspectImage } from "../src/lib/cms/media.ts";
import { ArticleService } from "../src/lib/cms/articles.ts";
import { normalizeArticle } from "../src/lib/cms/validation.ts";

const SECRET = "test-only-csrf-secret-with-more-than-32-characters";
const ACCESS_ENV = {
  CF_ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com/",
  CF_ACCESS_AUD: "access-audience",
  CMS_ALLOWED_EMAILS: "Writer@Example.com, editor@example.com",
  CMS_CSRF_SECRET: SECRET,
};

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function expectCmsError(fn, status) {
  return assert.rejects(fn, (error) => {
    assert.ok(error instanceof CmsError, "expected a CmsError");
    assert.equal(error.status, status);
    return true;
  });
}

test("API responses use a strict self-hosted CSP", () => {
  assert.match(ADMIN_CSP, /default-src 'self'/);
  assert.match(ADMIN_CSP, /script-src 'self'/);
  assert.match(ADMIN_CSP, /style-src 'self'(?:;|$)/);
  assert.match(ADMIN_CSP, /frame-ancestors 'none'/);
  assert.ok(!/unsafe-inline|unsafe-eval|\*|https?:/.test(ADMIN_CSP));
});

test("Access configuration is normalized and incomplete configuration fails closed", () => {
  const config = accessConfigFromEnv(ACCESS_ENV);
  assert.equal(config.teamDomain, "example.cloudflareaccess.com");
  assert.equal(config.audience, "access-audience");
  assert.deepEqual(config.allowedEmails, [
    "writer@example.com",
    "editor@example.com",
  ]);

  return expectCmsError(
    async () =>
      accessConfigFromEnv({ CMS_ALLOWED_EMAILS: "writer@example.com" }),
    503,
  );
});

test("dev bypass is limited to localhost outside production", async () => {
  const local = new Request("http://localhost/r1phun73r/api/session");
  const identity = await verifyAccessRequest(local, {
    CMS_DEV_BYPASS: "true",
    CMS_DEV_EMAIL: "Dev@Localhost",
  });
  assert.deepEqual(identity, { email: "dev@localhost", dev: true });

  const localPages = await verifyAccessRequest(local, {
    CMS_DEV_BYPASS: "true",
    CMS_DEV_EMAIL: "dev@localhost",
    CF_PAGES: "1",
    CMS_ENVIRONMENT: "local",
  });
  assert.deepEqual(localPages, { email: "dev@localhost", dev: true });

  await expectCmsError(
    async () =>
      verifyAccessRequest(local, {
        ...ACCESS_ENV,
        CMS_DEV_BYPASS: "true",
        CF_PAGES: "1",
      }),
    401,
  );
  await expectCmsError(
    async () =>
      verifyAccessRequest(local, {
        ...ACCESS_ENV,
        CMS_DEV_BYPASS: "true",
        CMS_ENVIRONMENT: "production",
      }),
    401,
  );
});

test("Access identities require a verified token and an allowlisted email", async () => {
  const config = accessConfigFromEnv(ACCESS_ENV);
  const verifyToken = async () => ({ email: "writer@example.com" });
  const identity = await verifyAccessRequest(
    new Request("https://blog.adithiyan.me/r1phun73r/api/session", {
      headers: { "cf-access-jwt-assertion": "signed-token" },
    }),
    ACCESS_ENV,
    { verifyToken },
  );
  assert.deepEqual(identity, { email: "writer@example.com", dev: false });
  assert.equal(config.allowedEmails.includes(identity.email), true);

  await expectCmsError(
    async () =>
      verifyAccessRequest(
        new Request("https://blog.adithiyan.me/r1phun73r/api/session", {
          headers: { "cf-access-jwt-assertion": "signed-token" },
        }),
        ACCESS_ENV,
        { verifyToken: async () => ({ email: "stranger@example.com" }) },
      ),
    403,
  );
});

test("CSRF tokens bind to the session, expire and reject tampering", async () => {
  const now = Date.UTC(2026, 9, 27, 12, 0, 0);
  const token = await createCsrfToken("writer@example.com", ACCESS_ENV, now);
  await verifyCsrfToken(token, "writer@example.com", ACCESS_ENV, now);

  await expectCmsError(
    async () => verifyCsrfToken(token, "other@example.com", ACCESS_ENV, now),
    403,
  );
  await expectCmsError(
    async () =>
      verifyCsrfToken(
        token,
        "writer@example.com",
        ACCESS_ENV,
        now + 2 * 60 * 60 * 1000 + 1,
      ),
    403,
  );
  await expectCmsError(
    async () =>
      verifyCsrfToken(
        `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`,
        "writer@example.com",
        ACCESS_ENV,
        now,
      ),
    403,
  );
  await expectCmsError(
    async () => verifyCsrfToken(null, "writer@example.com", ACCESS_ENV, now),
    403,
  );
});

test("writes require same-origin context and a valid CSRF token", async () => {
  const env = {
    CMS_DEV_BYPASS: "true",
    CMS_DEV_EMAIL: "writer@example.com",
    CMS_CSRF_SECRET: SECRET,
  };
  const token = await createCsrfToken("writer@example.com", env);
  const valid = await requireWriteAuth(
    new Request("http://localhost/r1phun73r/api/articles", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "x-cms-csrf": token,
      },
    }),
    env,
  );
  assert.deepEqual(valid, { email: "writer@example.com", dev: true });

  await expectCmsError(
    async () =>
      requireWriteAuth(
        new Request("http://localhost/r1phun73r/api/articles", {
          method: "POST",
          headers: { "x-cms-csrf": token },
        }),
        env,
      ),
    403,
  );

  await expectCmsError(
    async () =>
      requireWriteAuth(
        new Request("http://localhost/r1phun73r/api/articles", {
          method: "POST",
          headers: {
            origin: "https://attacker.example",
            "sec-fetch-site": "cross-site",
            "x-cms-csrf": token,
          },
        }),
        env,
      ),
    403,
  );

  await expectCmsError(
    async () =>
      requireWriteAuth(
        new Request("http://localhost/r1phun73r/api/articles", {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "x-cms-csrf": "not-a-token",
          },
        }),
        env,
      ),
    403,
  );
});

test("image inspection accepts real raster data and rejects active content", () => {
  const png = inspectImage(new Uint8Array(PNG_1X1));
  assert.deepEqual(
    { type: png.type, width: png.width, height: png.height },
    { type: "png", width: 1, height: 1 },
  );

  return Promise.all([
    expectCmsError(
      async () => inspectImage(new TextEncoder().encode("<svg></svg>")),
      415,
    ),
    expectCmsError(
      async () =>
        inspectImage(
          new TextEncoder().encode("<!doctype html><html><body></body></html>"),
        ),
      415,
    ),
    expectCmsError(async () => inspectImage(new Uint8Array()), 400),
  ]);
});

test("multipart uploads are bounded before FormData parsing", async () => {
  const form = new FormData();
  form.set("scope", "draft");
  form.set("file", new Blob([PNG_1X1], { type: "image/png" }), "shot.png");
  const parsed = await readFormData(
    new Request("http://localhost/r1phun73r/api/articles/demo/media", {
      method: "POST",
      body: form,
    }),
    2 * 1024 * 1024,
  );
  assert.equal(parsed.get("scope"), "draft");
  assert.equal(parsed.get("file").name, "shot.png");

  await expectCmsError(
    async () =>
      readFormData(
        new Request("http://localhost/r1phun73r/api/articles/demo/media", {
          method: "POST",
          headers: {
            "content-type": "multipart/form-data; boundary=test",
          },
          body: new Uint8Array(2048),
        }),
        1024,
      ),
    413,
  );
  await expectCmsError(
    async () =>
      readFormData(
        new Request("http://localhost/r1phun73r/api/articles/demo/media", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
        1024,
      ),
    415,
  );
});

test("article validation enforces cover pairing, image scope and raw HTML safety", () => {
  const base = {
    title: "A validated note",
    slug: "a-validated-note",
    description: "A description long enough to satisfy the publication schema.",
    publishedAt: "2026-01-02T03:04:05Z",
    topics: ["systems-tooling"],
  };
  const now = new Date("2026-06-01T00:00:00Z");

  const article = normalizeArticle(
    {
      frontmatter: {
        ...base,
        coverImage: "/images/a-validated-note/cover.png",
        coverAlt: "A diagram of the observed process tree.",
      },
      body: "A body with no active content.",
    },
    { mode: "publish", now },
  );
  assert.equal(
    article.frontmatter.coverImage,
    "/images/a-validated-note/cover.png",
  );

  const coverWithoutAlt = () =>
    normalizeArticle(
      {
        frontmatter: {
          ...base,
          coverImage: "/images/a-validated-note/cover.png",
        },
        body: "A body.",
      },
      { mode: "publish", now },
    );
  return Promise.all([
    expectCmsError(async () => coverWithoutAlt(), 400),
    expectCmsError(
      async () =>
        normalizeArticle(
          {
            frontmatter: {
              ...base,
              coverImage: "/images/another-article/cover.png",
              coverAlt: "Wrong article",
            },
            body: "A body.",
          },
          { mode: "publish", now },
        ),
      400,
    ),
    expectCmsError(
      async () =>
        normalizeArticle(
          {
            frontmatter: base,
            body: '<script>alert("x")</script>',
          },
          { mode: "publish", now },
        ),
      400,
    ),
    expectCmsError(
      async () =>
        normalizeArticle(
          {
            frontmatter: base,
            body: "![](/images/a-validated-note/shot.png)",
          },
          { mode: "publish", now },
        ),
      400,
    ),
  ]);
});

test("draft media reject unsafe slugs before contacting GitHub", async () => {
  let calls = 0;
  const gateway = {
    async list() {
      calls += 1;
      return [];
    },
    async getText() {
      calls += 1;
      return null;
    },
    async getRaw(path) {
      calls += 1;
      return path === "drafts/media/demo/shot.png"
        ? { path, sha: "sha", bytes: new Uint8Array(PNG_1X1) }
        : null;
    },
    async commit() {
      calls += 1;
      throw new Error("commit must not run");
    },
  };
  const service = new ArticleService({
    github: gateway,
    repoPrivateConfirmed: true,
  });

  const media = await service.getDraftMedia("demo", "shot.png");
  assert.equal(media.contentType, "image/png");
  assert.equal(calls, 1);

  await expectCmsError(
    async () => service.getDraftMedia("../demo", "shot.png"),
    400,
  );
  await expectCmsError(
    async () => service.getDraftMedia("demo", "../shot.png"),
    400,
  );
  await expectCmsError(async () => service.listMedia("../demo", "draft"), 400);
  assert.equal(calls, 1, "unsafe paths must not reach GitHub");
});

test("draft writes fail closed before any GitHub read when privacy is unconfirmed", async () => {
  let calls = 0;
  const gateway = {
    async list() {
      calls += 1;
      return [];
    },
    async getText() {
      calls += 1;
      return null;
    },
    async getRaw() {
      calls += 1;
      return null;
    },
    async commit() {
      calls += 1;
      throw new Error("commit must not run");
    },
  };
  const service = new ArticleService({
    github: gateway,
    repoPrivateConfirmed: false,
    now: () => new Date("2026-06-01T00:00:00Z"),
  });

  await expectCmsError(
    async () =>
      service.save({
        mode: "draft",
        frontmatter: { slug: "a-validated-note" },
        body: "Draft body.",
      }),
    503,
  );
  assert.equal(
    calls,
    0,
    "no GitHub call should happen before the privacy gate",
  );
});
