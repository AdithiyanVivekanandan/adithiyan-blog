import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { APPROVED_TOPICS } from "../src/lib/topics.ts";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));

const PUBLISHED_TOPICS = ["reverse-engineering", "systems-tooling"];

const EMPTY_TOPICS = APPROVED_TOPICS.filter(
  (slug) => !PUBLISHED_TOPICS.includes(slug),
);

const MARKERS = [
  "draft-canary-7f2e91",
  "draft-fixture-leaked-token",
  "future-canary-5b8d31",
  "fixture-future-dated",
];

const publicPages = [
  "index.html",
  "articles/index.html",
  "topics/index.html",
  "archive/index.html",
  "about/index.html",
  "search/index.html",
  "colophon/index.html",
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
  if (existsSync(join(distDir, path, "index.html"))) return true;
  const direct = join(distDir, path);
  return existsSync(direct) && statSync(direct).isFile();
}

test("topic index lists only topics with published articles", () => {
  const html = readPage("topics/index.html");
  assert.ok(
    !html.includes("No topics have published articles yet."),
    "empty directory state must be gone once a topic has articles",
  );
  for (const slug of PUBLISHED_TOPICS) {
    assert.ok(
      html.includes(`href="/topics/${slug}/"`),
      `populated topic ${slug} must be listed`,
    );
  }
  for (const slug of EMPTY_TOPICS) {
    assert.ok(
      !html.includes(`href="/topics/${slug}/"`),
      `empty topic ${slug} must stay hidden from the directory`,
    );
  }
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

test("topic pages list their articles or explain their emptiness", () => {
  for (const slug of EMPTY_TOPICS) {
    const html = readPage(`topics/${slug}/index.html`);
    assert.ok(
      html.includes("No articles have been published in this topic yet"),
      `${slug} explains itself while empty`,
    );
    assert.ok(
      html.includes('aria-current="page"'),
      `${slug} keeps its breadcrumb`,
    );
  }
  for (const slug of PUBLISHED_TOPICS) {
    const html = readPage(`topics/${slug}/index.html`);
    assert.ok(
      html.includes('href="/articles/understanding-windows-executables/"'),
      `${slug} links its published article`,
    );
    assert.ok(
      !html.includes("No articles have been published in this topic yet"),
      `${slug} no longer shows the empty state`,
    );
  }
});

test("archive groups the published article under its year", () => {
  const html = readPage("archive/index.html");
  assert.ok(
    !html.includes("No articles have been published yet."),
    "archive empty state must be gone once an article exists",
  );
  assert.ok(html.includes('id="year-2026"'), "2026 year section present");
  assert.ok(
    html.includes('href="/articles/understanding-windows-executables/"'),
    "article card listed under its year",
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

test("homepage links only populated topic regions", () => {
  const html = readPage("index.html");
  const topicHrefs = [
    ...new Set(
      [...html.matchAll(/href="(\/topics\/[^"]+)"/g)].map((match) => match[1]),
    ),
  ].sort();
  assert.deepEqual(
    topicHrefs,
    PUBLISHED_TOPICS.map((slug) => `/topics/${slug}/`).sort(),
    "homepage links exactly the populated regions",
  );
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
