import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  "windows-apis-malware-analysis-evidence",
  "Windows APIs for Malware Analysis",
  "Draft status — evidence pending",
  "VERIFY BEFORE PRACTICAL WORK",
];

function walkDist(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDist(path, files);
    } else {
      files.push(path);
    }
  }
  return files;
}

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

test("rss.xml lists no items while unpublished", () => {
  const xml = readDist("rss.xml");
  const items = xml.match(/<item>/g) ?? [];
  assert.equal(items.length, 0, "no published articles means no feed items");
  assert.ok(!xml.includes("<pubDate>"), "no dates without items");
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
    `${SITE}/colophon/`,
    `${SITE}/search/`,
    `${SITE}/topics/`,
  ]);

  assert.ok(
    !locs.some((loc) => loc.includes("ai-engineering")),
    "empty topic excluded",
  );
  assert.ok(!locs.some((loc) => loc.includes("404")), "404 excluded");
  for (const marker of MARKERS) {
    assert.ok(!xml.includes(marker), `sitemap must not contain ${marker}`);
  }
  assert.ok(!xml.includes("<lastmod>"), "no dates without articles");
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
  assert.match(
    html,
    /<div[^>]*class="page-404-card"[^>]*aria-hidden="true"/,
    "404 carries its decorative index-card detail",
  );
  assert.ok(html.includes('class="page-404-card__number"'), "card number");
  assert.ok(html.includes("field note — page missing"), "card label");
  for (const marker of MARKERS) {
    assert.ok(!html.includes(marker), `404 must not contain ${marker}`);
  }
});

test("public pages advertise RSS and carry social metadata", () => {
  for (const relative of [
    "index.html",
    "articles/index.html",
    "about/index.html",
    "search/index.html",
    "colophon/index.html",
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
    assert.ok(
      html.includes(`property="og:image" content="${SITE}/og.png"`),
      `${relative}: absolute og:image`,
    );
    assert.ok(
      html.includes('property="og:image:alt"'),
      `${relative}: og:image alt text`,
    );
    assert.ok(
      html.includes('property="og:image:width" content="1200"'),
      `${relative}: og:image dimensions`,
    );
  }
  const image = join(distDir, "og.png");
  assert.ok(existsSync(image), "og.png must be built to dist root");
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
    "search/index.html",
    "colophon/index.html",
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

test("the working draft never reaches any built file", () => {
  const files = walkDist(distDir);
  assert.ok(files.length > 0, "dist must exist - run `npm run build` first");
  const leaked = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const marker of MARKERS) {
      if (content.includes(marker)) {
        leaked.push(`${file}: ${marker}`);
      }
    }
  }
  assert.deepEqual(
    leaked,
    [],
    "draft and fixture content must appear nowhere in the production build",
  );
  assert.ok(
    !existsSync(
      join(distDir, "articles", "windows-apis-malware-analysis-evidence"),
    ),
    "the working draft must not have an article route",
  );
});
