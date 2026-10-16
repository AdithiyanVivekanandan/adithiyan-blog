import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { APPROVED_TOPICS } from "../src/lib/topics.ts";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));

const MARKERS = [
  "draft-canary-7f2e91",
  "draft-fixture-leaked-token",
  "future-canary-5b8d31",
  "fixture-future-dated",
];

const publicPages = [
  "index.html",
  "articles/index.html",
  "articles/repeatable-release-check-npm-node-test/index.html",
  "topics/index.html",
  "archive/index.html",
  "about/index.html",
  ...APPROVED_TOPICS.map((slug) => `topics/${slug}/index.html`),
];

function readPage(relative) {
  const path = join(distDir, relative);
  if (!existsSync(path)) {
    assert.fail(`${relative} not found - run \`npm run build\` first`);
  }
  return readFileSync(path, "utf8");
}

function distHasRoute(href) {
  const path = href.replace(/^\//, "").replace(/\/$/, "");
  return existsSync(join(distDir, path, "index.html"));
}

test("topic index lists only topics with live articles and correct counts", () => {
  const html = readPage("topics/index.html");
  assert.ok(html.includes("Systems &amp; Tooling"), "non-empty topic listed");
  assert.ok(
    html.includes('href="/topics/systems-tooling/"'),
    "topic index links the topic page",
  );
  assert.ok(html.includes("1 article"), "singular count for one article");
  assert.ok(
    !html.includes('href="/topics/ai-engineering/"'),
    "empty topics must be hidden from the directory",
  );
});

test("every approved topic has a generated page and unknown topics do not", () => {
  for (const slug of APPROVED_TOPICS) {
    assert.ok(
      existsSync(join(distDir, "topics", slug, "index.html")),
      `approved topic ${slug} must have a generated page`,
    );
  }
  assert.ok(
    !existsSync(join(distDir, "topics", "not-a-real-topic")),
    "unapproved topics must not generate routes",
  );
});

test("topic pages list live articles or show an honest empty state", () => {
  const populated = readPage("topics/systems-tooling/index.html");
  assert.ok(
    populated.includes("repeatable-release-check-npm-node-test"),
    "topic page lists its live article",
  );
  assert.ok(populated.includes('aria-current="page"'), "breadcrumb present");

  const empty = readPage("topics/ai-engineering/index.html");
  assert.ok(
    empty.includes("No articles have been published in this topic yet"),
    "empty topic explains itself",
  );
  assert.ok(
    !empty.includes("repeatable-release-check-npm-node-test"),
    "empty topic must not list unrelated articles",
  );
});

test("archive groups live articles by year and excludes future dates", () => {
  const html = readPage("archive/index.html");
  assert.ok(html.includes('id="year-2026"'), "current year section exists");
  assert.ok(
    html.includes("repeatable-release-check-npm-node-test"),
    "archive lists the live article",
  );
  assert.ok(!html.includes("2099"), "future year must not appear");
  assert.ok(!html.includes("year-2099"), "no future year anchor");
});

test("about page uses the established identity and links subject areas", () => {
  const html = readPage("about/index.html");
  assert.ok(html.includes("Adithiyan V."), "author attribution present");
  assert.ok(html.includes("Subject areas"));
  for (const slug of APPROVED_TOPICS) {
    assert.ok(
      html.includes(`href="/topics/${slug}/"`),
      `about page links every approved topic (${slug})`,
    );
  }
});

test("homepage topic entry points resolve to generated routes", () => {
  const html = readPage("index.html");
  const topicHrefs = [...html.matchAll(/href="(\/topics\/[^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(topicHrefs.length >= 1, "homepage must offer topic entry points");
  for (const href of topicHrefs) {
    assert.ok(distHasRoute(href), `homepage topic link ${href} must resolve`);
  }
});

test("every internal navigation link on every public page resolves", () => {
  for (const relative of publicPages) {
    const html = readPage(relative);
    const hrefs = new Set(
      [...html.matchAll(/<a\s[^>]*href="(\/[^"#]*)"/g)].map(
        (match) => match[1],
      ),
    );
    for (const href of hrefs) {
      assert.ok(
        distHasRoute(href),
        `${relative}: link ${href} must resolve to a generated route`,
      );
    }
  }
});

test("every public page has landmarks, page-specific metadata and a canonical URL", () => {
  const titles = new Map();
  for (const relative of publicPages) {
    const html = readPage(relative);
    assert.match(html, /<a class="skip-link"/, `${relative}: skip link`);
    assert.match(html, /<header class="site-header">/, `${relative}: header`);
    assert.match(html, /<main id="main"/, `${relative}: main landmark`);
    assert.match(html, /<footer class="site-footer">/, `${relative}: footer`);

    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title && title.length > 0, `${relative}: non-empty title`);
    const firstSeen = titles.get(title);
    assert.ok(
      !firstSeen,
      `duplicate title "${title}" on ${relative} and ${firstSeen}`,
    );
    titles.set(title, relative);

    assert.match(
      html,
      /<meta name="description" content="[^"]{20,}"/,
      `${relative}: specific description`,
    );
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical, `${relative}: canonical URL`);
    const path = canonical.replace(/^https?:\/\/[^/]+/, "");
    assert.equal(
      path,
      `/${relative.replace(/index\.html$/, "")}`,
      `${relative}: canonical must match the page path`,
    );
  }
});

test("draft and future fixture identifiers stay out of every new public route", () => {
  for (const relative of publicPages) {
    const html = readPage(relative);
    for (const marker of MARKERS) {
      assert.ok(
        !html.includes(marker),
        `${relative} must not contain ${marker}`,
      );
    }
  }
});
