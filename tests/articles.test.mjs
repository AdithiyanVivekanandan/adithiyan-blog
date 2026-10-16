import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const distDir = new URL("../dist", import.meta.url).pathname;
const articleUrl = new URL(
  "../dist/articles/repeatable-release-check-npm-node-test/index.html",
  import.meta.url,
);
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

test("article page renders metadata, dates and references", () => {
  const html = readBuild(articleUrl);
  assert.ok(
    html.includes("Building a repeatable release check"),
    "article title must render",
  );
  assert.ok(html.includes("12 October 2026"), "en-GB date must render");
  assert.match(html, /<time datetime="2026-10-12">/);
  assert.ok(html.includes('property="article:published_time"'));
  assert.ok(html.includes('rel="canonical"'));
  assert.ok(html.includes('aria-label="Breadcrumb"'));
  assert.ok(html.includes("Limitations"));
  assert.ok(html.includes("References"));
  assert.ok(html.includes("Technical context"));
  assert.ok(html.includes("min read"));
});

test("article page ships JSON-LD BlogPosting with escaped payload", () => {
  const html = readBuild(articleUrl);
  const match = html.match(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
  );
  assert.ok(match, "expected a JSON-LD script tag");
  assert.ok(
    !match[1].includes("<"),
    "JSON-LD payload must not contain raw < characters",
  );
  const data = JSON.parse(match[1].replace(/\\u003c/g, "<"));
  assert.equal(data["@type"], "BlogPosting");
  assert.equal(data.datePublished, "2026-10-12T00:00:00.000Z");
  assert.ok(
    data.mainEntityOfPage.startsWith("https://") &&
      data.mainEntityOfPage.endsWith(
        "/articles/repeatable-release-check-npm-node-test/",
      ),
    `mainEntityOfPage must be the canonical article URL, got ${data.mainEntityOfPage}`,
  );
  assert.ok(data.author.name.length > 0);
});

test("article page code blocks are keyboard-reachable regions", () => {
  const html = readBuild(articleUrl);
  const pres = html.match(/<pre class="astro-code[^>]*>/g) ?? [];
  assert.ok(
    pres.length >= 3,
    `expected at least 3 code blocks, got ${pres.length}`,
  );
  for (const pre of pres) {
    assert.ok(pre.includes('tabindex="0"'), "code block must be tabbable");
  }
  assert.ok(html.includes("--shiki-light"), "light code theme must be present");
  assert.ok(html.includes("--shiki-dark"), "dark code theme must be present");
});

test("articles index and homepage list only live articles", () => {
  for (const url of [homepageUrl, articlesIndexUrl]) {
    const html = readBuild(url);
    assert.ok(
      html.includes("repeatable-release-check-npm-node-test"),
      `${url.pathname} must link the published article`,
    );
    for (const marker of [DRAFT_SLUG, FUTURE_SLUG]) {
      assert.ok(
        !html.includes(marker),
        `${url.pathname} must not mention ${marker}`,
      );
    }
  }
});

test("article page renders a table of contents whose anchors resolve", () => {
  const html = readBuild(articleUrl);
  const tocMatch = html.match(
    /<details class="article__toc"[\s\S]*?<\/details>/,
  );
  assert.ok(tocMatch, "expected a table of contents disclosure");
  const hrefs = [...tocMatch[0].matchAll(/href="#([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(
    hrefs.length >= 2,
    `expected at least two TOC entries, got ${hrefs.length}`,
  );
  for (const id of hrefs) {
    assert.ok(
      html.includes(`id="${id}"`),
      `TOC anchor #${id} must match a heading id in the article body`,
    );
  }
});

test("article page ships the progressive copy-code enhancement", () => {
  const html = readBuild(articleUrl);
  assert.ok(
    html.includes("copy-code"),
    "copy-code control strings must ship in the article script",
  );
  assert.ok(
    html.includes("Copy failed"),
    "clipboard-failure feedback path must ship",
  );
  assert.ok(
    html.includes("Copy unavailable"),
    "missing-clipboard fallback path must ship",
  );
  const moduleScripts =
    html.match(/<script type="module">[\s\S]*?<\/script>/g) ?? [];
  assert.ok(
    moduleScripts.some((script) => script.includes("copy-code")),
    "copy-code logic must live in a bundled module script",
  );
});

test("reference links carry external-link accessible labels", () => {
  const html = readBuild(articleUrl);
  assert.ok(
    html.includes('rel="external noopener noreferrer"'),
    "reference links must declare external rel values",
  );
  assert.ok(
    html.includes("(external link)"),
    "reference links must include a visually hidden external-link label",
  );
});
