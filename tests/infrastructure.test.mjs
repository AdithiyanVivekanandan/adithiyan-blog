import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const SITE = "https://blog.adithiyan.me";

const MARKERS = [
  "draft-canary-7f2e91",
  "draft-fixture-leaked-token",
  "future-canary-5b8d31",
  "fixture-future-dated",
];

const RAW_AMPERSAND = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/;

function readDist(relative) {
  const path = join(distDir, relative);
  if (!existsSync(path)) {
    assert.fail(`${relative} not found - run \`npm run build\` first`);
  }
  return readFileSync(path, "utf8");
}

test("rss.xml is valid RSS 2.0 using the configured site URL", () => {
  const xml = readDist("rss.xml");
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.match(xml, /<rss version="2\.0"/);
  assert.ok(xml.includes(`<link>${SITE}/</link>`), "channel link is the site");
  assert.ok(
    xml.includes(`<atom:link href="${SITE}/rss.xml"`),
    "self link present",
  );
  assert.ok(RAW_AMPERSAND.test(xml) === false, "no unescaped ampersands");
  for (const marker of MARKERS) {
    assert.ok(!xml.includes(marker), `rss must not contain ${marker}`);
  }
});

test("rss.xml lists only live articles, newest first", () => {
  const xml = readDist("rss.xml");
  const items = xml.match(/<item>/g) ?? [];
  assert.equal(items.length, 1, "only the live fixture article is published");
  assert.ok(
    xml.includes(
      `<link>${SITE}/articles/repeatable-release-check-npm-node-test/</link>`,
    ),
  );
  assert.ok(xml.includes('<guid isPermaLink="true">'));
  assert.ok(xml.includes("<pubDate>Mon, 12 Oct 2026"));
  const firstItem = xml.indexOf("<item>");
  const title = xml.indexOf("Building a repeatable release check");
  assert.ok(title > firstItem, "article title is inside the channel");
  assert.ok(!xml.includes("2099"), "future-dated year must not appear");
});

test("sitemap.xml lists exactly the public routes", () => {
  const xml = readDist("sitemap.xml");
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.match(
    xml,
    /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
  );
  assert.ok(RAW_AMPERSAND.test(xml) === false, "no unescaped ampersands");

  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs.sort(), [
    `${SITE}/`,
    `${SITE}/about/`,
    `${SITE}/archive/`,
    `${SITE}/articles/`,
    `${SITE}/articles/repeatable-release-check-npm-node-test/`,
    `${SITE}/topics/`,
    `${SITE}/topics/systems-tooling/`,
  ]);

  assert.ok(
    !locs.some((loc) => loc.includes("ai-engineering")),
    "empty topic excluded",
  );
  assert.ok(!locs.some((loc) => loc.includes("404")), "404 excluded");
  for (const marker of MARKERS) {
    assert.ok(!xml.includes(marker), `sitemap must not contain ${marker}`);
  }
  assert.ok(xml.includes("<lastmod>2026-10-12</lastmod>"), "article lastmod");
});

test("robots.txt allows crawling and points at the sitemap", () => {
  const txt = readDist("robots.txt");
  assert.ok(txt.includes("User-agent: *"));
  assert.ok(txt.includes("Allow: /"));
  assert.ok(txt.includes(`Sitemap: ${SITE}/sitemap.xml`));
});

test("404 page exists with noindex, landmarks and recovery links", () => {
  const html = readDist("404.html");
  assert.match(html, /<meta name="robots" content="noindex"/);
  assert.match(html, /<title>Page not found — Technical Fieldnotes<\/title>/);
  assert.match(html, /<a class="skip-link" href="#main">/);
  assert.match(html, /<header class="site-header">/);
  assert.match(html, /<main id="main"/);
  assert.match(html, /<footer class="site-footer">/);
  assert.ok(html.includes('href="/"'), "recovery link to home");
  assert.ok(html.includes('href="/articles/"'), "recovery link to articles");
  assert.ok(html.includes('href="/topics/"'), "recovery link to topics");
  for (const marker of MARKERS) {
    assert.ok(!html.includes(marker), `404 must not contain ${marker}`);
  }
});

test("public pages advertise RSS and carry social metadata", () => {
  for (const relative of [
    "index.html",
    "articles/index.html",
    "about/index.html",
    "404.html",
  ]) {
    const html = readDist(relative);
    assert.ok(
      html.includes('rel="alternate" type="application/rss+xml"') ||
        html.includes('type="application/rss+xml"'),
      `${relative}: RSS discovery link`,
    );
    assert.ok(
      html.includes('name="twitter:card" content="summary"'),
      `${relative}: twitter card`,
    );
    assert.ok(
      html.includes('property="og:site_name"'),
      `${relative}: og:site_name`,
    );
    assert.ok(
      html.includes('name="twitter:title"'),
      `${relative}: twitter title`,
    );
  }
});

test("mobile menu control is present, labelled and progressive", () => {
  for (const relative of [
    "index.html",
    "articles/index.html",
    "archive/index.html",
    "404.html",
  ]) {
    const html = readDist(relative);
    assert.ok(html.includes('class="nav-toggle"'), `${relative}: toggle`);
    assert.ok(
      html.includes('aria-expanded="false"'),
      `${relative}: aria-expanded`,
    );
    assert.ok(
      html.includes('aria-controls="site-nav"'),
      `${relative}: aria-controls`,
    );
    assert.match(
      html,
      /<button\s+type="button"\s+class="nav-toggle"[\s\S]*?\shidden/,
      `${relative}: toggle hidden until JS runs`,
    );
    assert.ok(
      html.includes(
        '<nav id="site-nav" class="site-nav" aria-label="Primary">',
      ),
      `${relative}: nav keeps id and accessible name`,
    );
    assert.ok(
      html.includes('classList.add("js")'),
      `${relative}: html.js gate for menu CSS`,
    );
  }
});

test("footer exposes a visible RSS link on every public page", () => {
  for (const relative of [
    "index.html",
    "articles/index.html",
    "topics/index.html",
    "archive/index.html",
    "about/index.html",
    "404.html",
  ]) {
    const html = readDist(relative);
    assert.ok(
      html.includes('<a href="/rss.xml">RSS</a>'),
      `${relative}: footer must link the RSS feed visibly`,
    );
  }
});

test("homepage offers the RSS feed in the discovery flow", () => {
  const html = readDist("index.html");
  assert.ok(html.includes('class="feed-note"'), "feed note section present");
  assert.ok(
    html.includes('<a href="/rss.xml">an RSS feed</a>'),
    "homepage links the RSS feed in body copy",
  );
});

test("favicon exists and is referenced from every public page", () => {
  const svg = join(distDir, "favicon.svg");
  assert.ok(existsSync(svg), "favicon.svg must be built to dist root");
  const svgText = readFileSync(svg, "utf8");
  assert.ok(svgText.includes("<svg"), "favicon is an SVG document");
  const ico = join(distDir, "favicon.ico");
  assert.ok(existsSync(ico), "favicon.ico must be built to dist root");
  for (const relative of [
    "index.html",
    "articles/index.html",
    "about/index.html",
    "404.html",
  ]) {
    const html = readDist(relative);
    assert.ok(
      html.includes('<link rel="icon" href="/favicon.ico"'),
      `${relative}: ICO fallback referenced in document head`,
    );
    assert.ok(
      html.includes(
        '<link rel="icon" type="image/svg+xml" href="/favicon.svg"',
      ),
      `${relative}: SVG favicon referenced in document head`,
    );
  }
});

test("about page states the correction policy", () => {
  const html = readDist("about/index.html");
  assert.ok(
    html.includes("Material errors are corrected in the article itself"),
    "correction policy must promise in-place correction",
  );
  assert.ok(
    html.includes("marked with an updated date"),
    "correction policy must reference the updated-date mechanism",
  );
});
