import assert from "node:assert/strict";
import { test } from "node:test";

import { ADMIN_CSP } from "../src/lib/cms/http.ts";

import * as middleware from "../functions/r1phun73r/_middleware.ts";
import * as articlesIndex from "../functions/r1phun73r/api/articles/index.ts";
import * as article from "../functions/r1phun73r/api/articles/[slug].ts";
import * as archive from "../functions/r1phun73r/api/articles/[slug]/archive.ts";
import * as exportMarkdown from "../functions/r1phun73r/api/articles/[slug]/export.ts";
import * as media from "../functions/r1phun73r/api/articles/[slug]/media.ts";
import * as draftMedia from "../functions/r1phun73r/api/media/draft/[slug]/[file].ts";
import * as importMarkdown from "../functions/r1phun73r/api/import.ts";
import * as deployment from "../functions/r1phun73r/api/deployment.ts";
import * as session from "../functions/r1phun73r/api/session.ts";

const ACCESS_ENV = {
  CF_ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com/",
  CF_ACCESS_AUD: "access-audience",
  CMS_ALLOWED_EMAILS: "writer@example.com",
  CMS_CSRF_SECRET: "test-only-csrf-secret-with-more-than-32-characters",
};

function context(request, params = {}) {
  return {
    request,
    env: ACCESS_ENV,
    params,
    data: {},
    next: async () => new Response(null, { status: 404 }),
  };
}

async function assertUnauthenticated(label, handler, path, method = "GET") {
  const request = new Request(`https://blog.adithiyan.me${path}`, {
    method,
    headers:
      method === "GET"
        ? {}
        : {
            "content-type": "application/json",
            origin: "https://blog.adithiyan.me",
          },
  });
  const response = await handler(context(request));
  assert.equal(response.status, 401, label);
  const body = await response.json();
  assert.equal(body.ok, false, label);
  assert.equal(body.error.code, "unauthenticated", label);
  assert.equal(
    response.headers.get("content-security-policy"),
    ADMIN_CSP,
    label,
  );
  assert.equal(
    response.headers.get("cache-control"),
    "no-store, max-age=0",
    label,
  );
}

test("admin middleware hides HTML and API content without a valid identity", async () => {
  const htmlRequest = new Request("https://blog.adithiyan.me/r1phun73r/");
  const htmlResponse = await middleware.onRequest({
    ...context(htmlRequest),
    next: async () => new Response("private publishing desk"),
  });
  assert.equal(htmlResponse.status, 401);
  assert.match(htmlResponse.headers.get("content-type") ?? "", /^text\/html/);
  assert.match(
    htmlResponse.headers.get("content-security-policy") ?? "",
    /default-src 'self'/,
  );
  assert.equal(
    htmlResponse.headers.get("cache-control"),
    "no-store, max-age=0",
  );
  const html = await htmlResponse.text();
  assert.match(html, /Access denied/);
  assert.ok(!html.includes("private publishing desk"));

  const apiRequest = new Request(
    "https://blog.adithiyan.me/r1phun73r/api/session",
  );
  const apiResponse = await middleware.onRequest({
    ...context(apiRequest),
    next: async () => new Response("private session"),
  });
  assert.equal(apiResponse.status, 401);
  assert.equal((await apiResponse.json()).error.code, "unauthenticated");
  assert.equal(apiResponse.headers.get("cache-control"), "no-store, max-age=0");
});

test("admin middleware applies private headers after a local bypass", async () => {
  const request = new Request("http://localhost/r1phun73r/api/session");
  const ctx = {
    ...context(request),
    env: {
      CMS_DEV_BYPASS: "true",
      CMS_DEV_EMAIL: "Writer@Example.com",
      CMS_ENVIRONMENT: "local",
      CF_PAGES: "1",
    },
    next: async () =>
      new Response("ok", {
        headers: { "Cache-Control": "public, max-age=300" },
      }),
  };
  const response = await middleware.onRequest(ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(ctx.data.auth, {
    email: "writer@example.com",
    dev: true,
  });
  assert.equal(await response.text(), "ok");
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
});

test("every CMS read and write endpoint rejects an unauthenticated request first", async () => {
  await assertUnauthenticated(
    "article list",
    articlesIndex.onRequestGet,
    "/r1phun73r/api/articles",
  );
  await assertUnauthenticated(
    "create article",
    articlesIndex.onRequestPost,
    "/r1phun73r/api/articles",
    "POST",
  );
  await assertUnauthenticated(
    "article detail",
    article.onRequestGet,
    "/r1phun73r/api/articles/demo",
  );
  await assertUnauthenticated(
    "save article",
    article.onRequestPut,
    "/r1phun73r/api/articles/demo",
    "PUT",
  );
  await assertUnauthenticated(
    "delete article",
    article.onRequestDelete,
    "/r1phun73r/api/articles/demo?location=draft",
    "DELETE",
  );
  await assertUnauthenticated(
    "archive article",
    archive.onRequestPost,
    "/r1phun73r/api/articles/demo/archive",
    "POST",
  );
  await assertUnauthenticated(
    "export article",
    exportMarkdown.onRequestGet,
    "/r1phun73r/api/articles/demo/export",
  );
  await assertUnauthenticated(
    "list media",
    media.onRequestGet,
    "/r1phun73r/api/articles/demo/media",
  );
  await assertUnauthenticated(
    "upload media",
    media.onRequestPost,
    "/r1phun73r/api/articles/demo/media",
    "POST",
  );
  await assertUnauthenticated(
    "delete media",
    media.onRequestDelete,
    "/r1phun73r/api/articles/demo/media",
    "DELETE",
  );
  await assertUnauthenticated(
    "draft media preview",
    draftMedia.onRequestGet,
    "/r1phun73r/api/media/draft/demo/shot.png",
  );
  await assertUnauthenticated(
    "import markdown",
    importMarkdown.onRequestPost,
    "/r1phun73r/api/import",
    "POST",
  );
  await assertUnauthenticated(
    "deployment status",
    deployment.onRequestGet,
    "/r1phun73r/api/deployment?sha=0123456789012345678901234567890123456789",
  );
  await assertUnauthenticated(
    "session",
    session.onRequestGet,
    "/r1phun73r/api/session",
  );
});

test("CMS routes expose only the methods they implement", () => {
  const routes = [
    ["article list", articlesIndex, ["Get", "Post"]],
    ["article detail", article, ["Get", "Put", "Delete"]],
    ["archive", archive, ["Post"]],
    ["export", exportMarkdown, ["Get"]],
    ["media", media, ["Get", "Post", "Delete"]],
    ["draft media", draftMedia, ["Get"]],
    ["import", importMarkdown, ["Post"]],
    ["deployment", deployment, ["Get"]],
    ["session", session, ["Get"]],
  ];

  for (const [label, route, methods] of routes) {
    const exports = Object.keys(route)
      .filter((name) => name.startsWith("onRequest"))
      .sort();
    assert.deepEqual(
      exports,
      methods.map((method) => `onRequest${method}`).sort(),
      label,
    );
  }
});
