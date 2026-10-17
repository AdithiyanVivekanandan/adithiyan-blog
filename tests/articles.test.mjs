import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const distDir = new URL("../dist", import.meta.url).pathname;
const articlesIndexUrl = new URL(
  "../dist/articles/index.html",
  import.meta.url,
);
const homepageUrl = new URL("../dist/index.html", import.meta.url);

const DRAFT_CANARY = "draft-canary-7f2e91";
const DRAFT_SLUG = "draft-fixture-leaked-token";
const FUTURE_CANARY = "future-canary-5b8d31";
const FUTURE_SLUG = "fixture-future-dated";
const EXCLUDED_MARKERS = [DRAFT_CANARY, DRAFT_SLUG, FUTURE_CANARY, FUTURE_SLUG];

function readBuild(url) {
  if (!existsSync(url)) {
    assert.fail(`${url.pathname} not found - run \`npm run build\` first`);
  }
  return readFileSync(url, "utf8");
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

test("draft and future-dated fixtures are fully excluded from the public build", () => {
  assert.ok(existsSync(distDir), "dist/ must exist - run `npm run build`");
  const leakedFiles = [];
  for (const file of walk(distDir)) {
    const content = readFileSync(file, "utf8");
    if (EXCLUDED_MARKERS.some((marker) => content.includes(marker))) {
      leakedFiles.push(file);
    }
  }
  assert.deepEqual(
    leakedFiles,
    [],
    "draft and scheduled-fixture identifiers must not appear anywhere in dist/",
  );
  for (const slug of [DRAFT_SLUG, FUTURE_SLUG]) {
    assert.ok(
      !existsSync(join(distDir, "articles", slug)),
      `no route may be generated for excluded slug ${slug}`,
    );
  }
});

test("removed sample article leaves no route or references behind", () => {
  assert.ok(
    !existsSync(join(distDir, "articles", "repeatable-release-check")),
    "removed sample article must not leave a route behind",
  );
  for (const file of walk(join(distDir, "articles"))) {
    assert.ok(
      !file.includes("repeatable-release-check"),
      `stale article output must not remain in dist: ${file}`,
    );
  }
  for (const url of [homepageUrl, articlesIndexUrl]) {
    const html = readBuild(url);
    assert.ok(
      !html.includes("repeatable-release-check-npm-node-test"),
      `${url.pathname} must not reference the removed sample article`,
    );
  }
});

test("empty publication shows honest empty states and no article links", () => {
  for (const url of [homepageUrl, articlesIndexUrl]) {
    const html = readBuild(url);
    assert.ok(
      html.includes("No articles have been published yet."),
      `${url.pathname} must show the honest empty state`,
    );
    const detailHrefs = [
      ...html.matchAll(/<a\s[^>]*href="(\/articles\/[^"#]*)"/g),
    ].map((match) => match[1]);
    for (const href of detailHrefs) {
      assert.equal(
        href,
        "/articles/",
        `${url.pathname} must not link any article detail page, found ${href}`,
      );
    }
    for (const marker of [DRAFT_SLUG, FUTURE_SLUG]) {
      assert.ok(
        !html.includes(marker),
        `${url.pathname} must not mention ${marker}`,
      );
    }
  }
});

test("articles index and homepage list only live articles", () => {
  for (const url of [homepageUrl, articlesIndexUrl]) {
    const html = readBuild(url);
    assert.ok(
      html.includes("Technical Fieldnotes"),
      `${url.pathname} must still render its publication identity`,
    );
    for (const marker of [DRAFT_SLUG, FUTURE_SLUG]) {
      assert.ok(
        !html.includes(marker),
        `${url.pathname} must not mention ${marker}`,
      );
    }
  }
});
