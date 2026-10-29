import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { AUTHOR } from "../src/consts.ts";
import { topicLabel } from "../src/lib/topics.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(repoRoot, "dist");
const astroBin = join(repoRoot, "node_modules", ".bin", "astro");

const CANARY = "integration-canary-8c42";
const SLUG = "temp-integration-published-note";
const TITLE = "Integration probe: populated publication behavior";
const PUBLISHED_AT = new Date("2026-06-01T09:00:00Z");
const SITE = "https://blog.adithiyan.me";
const scratchDir = "/tmp/opencode/integration-probe";
const outDir = join(scratchDir, "dist");
const stagingDir = join(repoRoot, ".probe-dist");

const DRAFT_MARKERS = [
  "draft-canary-7f2e91",
  "draft-fixture-leaked-token",
  "future-canary-5b8d31",
  "fixture-future-dated",
  "windows-apis-malware-analysis-evidence",
  "Windows APIs for Malware Analysis",
  "Draft status — evidence pending",
  "VERIFY BEFORE PRACTICAL WORK",
];

const FIXTURE_NAME = `zz-${SLUG}.md`;
const fixturePath = join(repoRoot, "src", "content", "articles", FIXTURE_NAME);
const coverDir = join(repoRoot, "public", "images", SLUG);
const coverPath = join(coverDir, "cover.png");
const COVER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const FIXTURE_BODY = `---
title: ${JSON.stringify(TITLE)}
slug: "${SLUG}"
description: "Temporary build fixture exercising article, index and feed behavior; removed automatically after the test run."
coverImage: "/images/${SLUG}/cover.png"
coverAlt: "A neutral one-pixel cover used only by the isolated build probe."
publishedAt: 2026-06-01T09:00:00Z
status: published
topics:
  - systems-tooling
  - ai-engineering
articleType: investigation
technicalContext: "Node 24 and Astro 7 on the repository test runner during the isolated build probe."
limitations: "This fixture exists only during the article-template test run and is deleted afterwards; its statements describe build behavior, not research findings."
references:
  - title: "Astro documentation"
    url: "https://docs.astro.build/"
    annotation: "Primary framework documentation used by this site's build configuration."
  - title: "Node.js test runner"
    url: "https://nodejs.org/api/test.html"
    annotation: "Runner used by the repository's automated suite."
---

An introductory paragraph carrying the isolated-build canary ${CANARY} so
output can be distinguished from production text.

## Static imports reveal structure

Static evidence describes capability, not behavior, and must be quoted as
such in any published write-up.

### Reading the import table

Details live under a subsection so the table of contents has nested entries.

## Dynamic observation adds evidence

Dynamic claims require a controlled environment and recorded observations.

\`\`\`js
const probe = "${CANARY}";
console.log(probe, 1 + 1);
\`\`\`

## Recording evidence responsibly

Static and dynamic observation answer different questions, so the method is
recorded before any finding:

| Observation source | Can establish | Cannot establish |
| --- | --- | --- |
| Static import table | Which functions the binary references | Whether they are called at runtime |
| Controlled run | Observed call sequence and arguments | Intent without corroboration |

- [x] Record tool versions before any execution.
- [ ] Confirm the monitoring approach in the isolated lab.

The table above states <span class="evidence evidence--fact">fact</span>
information about the method itself; reading intent into it would be
<span class="evidence evidence--inference">inference</span>, and the
monitoring choice stays <span class="evidence evidence--unknown">unknown</span>
until recorded[^1].

### Interpreting the observation gap

An unobserved gap stays unknown; do not fill it from plausibility. Keyboard
shortcuts such as <kbd>Ctrl</kbd>+<kbd>C</kbd> are the fallback that the copy
control documents when clipboard APIs are unavailable.

[^1]: Footnotes carry the provenance of a convention, not new findings.

## Limitations belong to the method

Published articles must state what the evidence does not establish.
`;

function writeIntegrationConfig() {
  mkdirSync(scratchDir, { recursive: true });
  const configPath = join(scratchDir, "astro-integration.config.mjs");
  writeFileSync(
    configPath,
    [
      `import base from ${JSON.stringify(pathToFileURL(join(repoRoot, "astro.config.mjs")).href)};`,
      "export default {",
      "  ...base,",
      `  outDir: ${JSON.stringify(stagingDir)},`,
      "};",
      "",
    ].join("\n"),
  );
  return configPath;
}

function readBuilt(relative) {
  const path = join(outDir, relative);
  if (!existsSync(path)) {
    assert.fail(
      `${relative} missing from the isolated build - the populated-content probe did not run?`,
    );
  }
  return readFileSync(path, "utf8");
}

function walkBuilt(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    files.push(...(entry.isDirectory() ? walkBuilt(path) : [path]));
  }
  return files;
}

function collapseWhitespace(text) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function totalScriptBytes(html) {
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) ?? [];
  return scripts.reduce((sum, script) => sum + Buffer.byteLength(script), 0);
}

// Build once at file scope so every test below asserts a single coherent run.
// Astro stage-renames prerendered assets inside the project, which cannot cross
// filesystems, so the built output stages in the repo (same fs as `.astro/`)
// and is copied to the isolated scratch directory before being removed.
mkdirSync(scratchDir, { recursive: true });
rmSync(outDir, { recursive: true, force: true });
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(coverDir, { recursive: true });
writeFileSync(coverPath, COVER_PNG);
writeFileSync(fixturePath, FIXTURE_BODY);
try {
  const configPath = writeIntegrationConfig();
  const relativeConfigPath = relative(repoRoot, configPath);
  const spawnResult = spawnSync(
    astroBin,
    ["build", "--config", relativeConfigPath],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 240_000,
    },
  );
  if (spawnResult.error) throw spawnResult.error;
  if (spawnResult.status !== 0) {
    throw new Error(
      `isolated build failed:\n${spawnResult.stdout ?? ""}\n${spawnResult.stderr ?? ""}`,
    );
  }
  cpSync(stagingDir, outDir, { recursive: true });
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
const buildResult = { status: 0 };

after(() => {
  rmSync(fixturePath, { force: true });
  rmSync(coverDir, { recursive: true, force: true });
  rmSync(stagingDir, { recursive: true, force: true });
  rmSync(outDir, { recursive: true, force: true });
  const sync = spawnSync(astroBin, ["sync"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (sync.status !== 0) {
    throw new Error(
      `content store could not be restored after the fixture run: ${sync.stdout ?? ""}${sync.stderr ?? ""}`,
    );
  }
});

test("a temporary published article builds into an isolated output directory", () => {
  assert.equal(
    buildResult.status,
    0,
    "the isolated populated build completed without errors",
  );
  assert.ok(
    existsSync(join(outDir, "articles", SLUG, "index.html")),
    "the published fixture must produce an article route in the isolated build",
  );
  const leaked = [];
  for (const file of walkBuilt(outDir)) {
    const content = readFileSync(file, "utf8");
    if (DRAFT_MARKERS.some((marker) => content.includes(marker))) {
      leaked.push(file);
    }
  }
  assert.deepEqual(
    leaked,
    [],
    "fixtures for drafts and future dates must stay excluded even in a populated build",
  );
});

test("the isolated build never touches the production dist", () => {
  assert.ok(
    existsSync(join(distDir, "articles", "index.html")),
    "production dist must exist - run `npm run build` first",
  );
  const entries = readdirSync(join(distDir, "articles"));
  assert.deepEqual(
    entries.sort(),
    ["index.html", "understanding-windows-executables"],
    "production articles/ lists exactly the published article routes",
  );
});

test("articles index lists the published article newest-first", () => {
  const html = readBuilt("articles/index.html");
  assert.ok(
    html.includes('href="/articles/temp-integration-published-note/"'),
    "article card present in the index",
  );
  assert.ok(
    html.indexOf('href="/articles/understanding-windows-executables/"') <
      html.indexOf('href="/articles/temp-integration-published-note/"'),
    "the newest article is listed first",
  );
  assert.ok(
    !html.includes("No articles have been published yet."),
    "index empty state gone once an article exists",
  );
});

test("article page renders breadcrumb, kicker, metadata and a working TOC", () => {
  const html = readBuilt(`articles/${SLUG}/index.html`);
  assert.ok(html.includes('aria-label="Breadcrumb"'), "breadcrumb present");
  assert.ok(
    html.includes("Investigation ·") &&
      html.includes(
        '<a href="/topics/systems-tooling/">Systems &amp; Tooling</a>',
      ) &&
      html.includes('<a href="/topics/ai-engineering/">AI Engineering</a>'),
    "topic kicker names the article type and links its topics",
  );
  assert.ok(
    html.includes(`By <a href="/about/" rel="author">${AUTHOR}</a>`),
    "author attribution links to the author page",
  );
  assert.ok(html.includes("Published <time"), "publication date present");
  assert.match(html, /<p class="article__summary">Temp/, "summary present");
  assert.ok(
    html.includes('class="article__cover"') &&
      html.includes(`src="/images/${SLUG}/cover.png"`) &&
      html.includes("A neutral one-pixel cover used only by the isolated"),
    "cover image renders with its alt text",
  );
  assert.ok(
    (html.match(/<h1[\s>]/g) ?? []).length === 1,
    "exactly one h1 on the article page",
  );
  assert.ok(
    html.includes('<details class="article__toc" open>'),
    "TOC renders for a multi-section article",
  );
  const tocLinks = [...html.matchAll(/<a href="#([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(tocLinks.length >= 3, "TOC links three or more sections");
  for (const anchor of tocLinks) {
    assert.ok(
      html.includes(`id="${anchor}"`),
      `TOC anchor ${anchor} must resolve to a heading id`,
    );
  }
  assert.ok(html.includes(CANARY), "article body contains its canary text");
  assert.match(
    html,
    /<pre class="astro-code[^"]*"[^>]*data-language/,
    "code block rendered with its language",
  );
});

test("technical reading elements render natively from authoring markup", () => {
  const html = readBuilt(`articles/${SLUG}/index.html`);
  assert.ok(html.includes("<table>"), "comparison table rendered");
  assert.ok(html.includes('class="task-list-item'), "task list item classed");
  const checkboxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
  assert.equal(checkboxes.length, 2, "both task list checkboxes render");
  assert.ok(
    checkboxes.every((element) => element.includes("disabled")),
    "task checkboxes are non-interactive",
  );
  assert.ok(
    checkboxes.some((element) => element.includes("checked")),
    "the first task's checked state renders",
  );
  assert.ok(
    html.includes("data-footnotes") && html.includes('class="footnotes"'),
    "footnote section renders with both attribute and class",
  );
  assert.ok(
    html.includes("data-footnote-backref"),
    "footnote backrefs render with their real token",
  );
  assert.ok(html.includes("<kbd>"), "kbd rendered");
  assert.ok(
    html.includes('class="evidence evidence--fact"') &&
      html.includes('class="evidence evidence--inference"') &&
      html.includes('class="evidence evidence--unknown"'),
    "evidence labels survive as declared in the markup",
  );
  assert.ok(
    totalScriptBytes(html) <= 10 * 1024,
    `article page script payload ${totalScriptBytes(html)} bytes exceeds the 10 KB budget`,
  );
});

test("the article stylesheet targets the real footnote token", () => {
  const html = readBuilt(`articles/${SLUG}/index.html`);
  const cssLinks = [
    ...html.matchAll(/<link rel="stylesheet" href="([^"]+\.css)"/g),
  ].map((match) => match[1].replace(/^\//, ""));
  assert.ok(cssLinks.length > 0, "article page links its stylesheets");
  const css = cssLinks.map((href) => readBuilt(href)).join("\n");
  assert.match(
    css,
    /data-footnote-backref\]/,
    "stylesheet must style [data-footnote-backref], not a class the pipeline never emits",
  );
  assert.match(
    css,
    /\.article__body \.footnotes h2/,
    "GFM's generated Footnotes h2 must be styled as a small editorial label, not an inherited body h2",
  );
});

test("article metadata, canonical URL and sharing metadata are correct", () => {
  const html = readBuilt(`articles/${SLUG}/index.html`);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  assert.equal(
    canonical,
    `${SITE}/articles/${SLUG}/`,
    "canonical URL must match the article route",
  );
  assert.ok(
    html.includes('property="og:type" content="article"'),
    "og:type article",
  );
  assert.ok(
    html.includes(
      `property="article:published_time" content="${PUBLISHED_AT.toISOString()}"`,
    ),
    "article:published_time matches frontmatter",
  );
  assert.ok(
    html.includes(
      'name="robots" content="index, follow, max-image-preview:large"',
    ),
    "published articles explicitly allow indexing and large image previews",
  );
  assert.ok(
    !html.includes("Updated ") &&
      !html.includes('property="article:modified_time"'),
    "article pages do not display or advertise a revision date",
  );
  assert.match(
    html,
    /<title>Integration probe: populated publication behavior — Technical Fieldnotes<\/title>/,
  );
});

test("article JSON-LD matches the visible content", () => {
  const html = readBuilt(`articles/${SLUG}/index.html`);
  const script = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(script, "JSON-LD block present");
  const graph = JSON.parse(script)["@graph"];
  assert.ok(Array.isArray(graph), "JSON-LD exposes a linked graph");
  const node = (type) => graph.find((candidate) => candidate["@type"] === type);
  const article = node("BlogPosting");
  const person = node("Person");
  const breadcrumb = node("BreadcrumbList");
  assert.ok(article, "BlogPosting node present");
  assert.ok(person, "Person node present");
  assert.ok(breadcrumb, "BreadcrumbList node present");
  assert.equal(article.headline, TITLE);
  assert.equal(article.datePublished, PUBLISHED_AT.toISOString());
  assert.equal(article.author["@id"], person["@id"]);
  assert.equal(article.publisher["@id"], person["@id"]);
  assert.deepEqual(article.mainEntityOfPage, {
    "@type": "WebPage",
    "@id": `${SITE}/articles/${SLUG}/`,
  });
  assert.equal(article.articleSection, topicLabel("systems-tooling"));
  assert.deepEqual(article.image, [`${SITE}/images/${SLUG}/cover.png`]);
  assert.equal(article.isPartOf["@id"], `${SITE}/#blog`);
  assert.ok(article.wordCount > 0, "word count is recorded");
  assert.match(article.timeRequired, /^PT\d+M$/, "reading time is ISO 8601");
  assert.equal(article.isAccessibleForFree, true);
  assert.equal(article.citation.length, 2, "references become citations");
  assert.deepEqual(
    breadcrumb.itemListElement.map((item) => item.name),
    ["Home", "Articles", TITLE],
  );
  assert.ok(!("dateModified" in article), "no revision date is emitted");
});

test("references and limitations sections render with their data", () => {
  const html = readBuilt(`articles/${SLUG}/index.html`);
  assert.ok(
    html.includes('id="references-heading"'),
    "references section present",
  );
  assert.ok(
    html.includes('href="https://docs.astro.build/"') &&
      html.includes('href="https://nodejs.org/api/test.html"'),
    "both reference links rendered",
  );
  assert.ok(
    html.includes("Primary framework documentation"),
    "reference annotation rendered",
  );
  assert.ok(
    html.includes('id="limitations-heading"'),
    "limitations section present",
  );
  assert.ok(
    html.includes("deleted afterwards"),
    "limitation text rendered verbatim",
  );
});

test("copy-code control stays progressive and announces success accessibly", () => {
  const html = readBuilt(`articles/${SLUG}/index.html`);
  assert.ok(
    !html.includes('class="copy-code"'),
    "no dead copy button exists before JavaScript runs",
  );
  const js = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((code) => code.includes("copy-code"));
  assert.ok(
    js,
    "article enhancement ships as bundled JS inlined into the page",
  );
  assert.ok(
    js.includes("Ctrl+C to copy"),
    "copy control and failure fallback survive bundling",
  );
  assert.ok(
    js.includes("region") && js.includes("aria-label"),
    "code regions are labelled for assistive technology",
  );
  assert.ok(js.includes("status"), "copy feedback announces politely");
  assert.ok(
    js.includes("navigator.clipboard") && js.includes("writeText"),
    "clipboard API used when available",
  );
});

test("pager and related sections render once two articles are published", () => {
  const html = readBuilt(`articles/${SLUG}/index.html`);
  assert.ok(
    html.includes('aria-label="Previous and next articles"'),
    "pager appears when a neighbour article exists",
  );
  assert.ok(
    html.includes('id="related-heading"'),
    "related section appears for articles sharing a topic",
  );
  assert.ok(
    html.includes('href="/articles/understanding-windows-executables/"'),
    "the related or pager sections link the other published article",
  );
});

test("RSS feed contains both published articles with stable links and dates", () => {
  const xml = readBuilt("rss.xml");
  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
  assert.ok(xml.includes("<pubDate>"), "items carry publication dates");
  for (const slug of [SLUG, "understanding-windows-executables"]) {
    assert.ok(
      xml.includes(`<link>${SITE}/articles/${slug}/</link>`),
      `feed lists ${slug} with its canonical URL`,
    );
  }
  assert.ok(xml.includes("<lastBuildDate>"), "channel freshness present");
  for (const marker of DRAFT_MARKERS) {
    assert.ok(!xml.includes(marker), `feed must not contain ${marker}`);
  }
});

test("sitemap lists the article routes, lastmod and the non-empty topics", () => {
  const xml = readBuilt("sitemap.xml");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const slug of [SLUG, "understanding-windows-executables"]) {
    assert.ok(
      locs.includes(`${SITE}/articles/${slug}/`),
      `article route ${slug} in the sitemap`,
    );
  }
  for (const slug of [
    "systems-tooling",
    "ai-engineering",
    "reverse-engineering",
  ]) {
    assert.ok(
      locs.includes(`${SITE}/topics/${slug}/`),
      `non-empty topic ${slug} appears in the sitemap`,
    );
  }
  assert.ok(
    locs.includes(`${SITE}/topics/`) && !locs.includes(`${SITE}/search/`),
    "directory is listed while the noindex search page stays out",
  );
  const escapedSite = SITE.replace(/\./g, "\\.");
  const articleBlock = xml.match(
    new RegExp(
      `<url>\\s*<loc>${escapedSite}/articles/${SLUG}/</loc>[\\s\\S]*?</url>`,
    ),
  )?.[0];
  assert.ok(articleBlock, "fixture article entry present");
  assert.ok(
    articleBlock.includes("<lastmod>2026-06-01</lastmod>"),
    "fixture lastmod equals the publication date",
  );
  const realBlock = xml.match(
    new RegExp(
      `<url>\\s*<loc>${escapedSite}/articles/understanding-windows-executables/</loc>[\\s\\S]*?</url>`,
    ),
  )?.[0];
  assert.ok(realBlock, "published article entry present");
  assert.ok(
    realBlock.includes("<lastmod>2026-10-17</lastmod>"),
    "published article lastmod equals its publication date",
  );
});

test("homepage switches to populated layout: featured, recent and lead region", () => {
  const html = readBuilt("index.html");
  assert.ok(html.includes("Featured"), "featured section present");
  assert.ok(
    html.indexOf('href="/articles/understanding-windows-executables/"') <
      html.indexOf('href="/articles/temp-integration-published-note/"'),
    "the newest article is featured with the older one following",
  );
  assert.ok(html.includes("territory--lead"), "lead region exists");
  assert.equal(
    (html.match(/Surveyed — no field notes yet/g) ?? []).length,
    0,
    "empty regions are omitted from the populated homepage",
  );
  assert.ok(
    !html.includes("territory--empty"),
    "empty regions carry no marker because they are not rendered",
  );
  const counts = [
    ...html.matchAll(
      /<p class="territory__count">\s*<a href="(\/topics\/[a-z-]+\/)">([\s\S]*?)<\/a>/g,
    ),
  ];
  assert.equal(
    counts.length,
    3,
    "three populated regions expose their count links",
  );
  const texts = counts.map((match) =>
    collapseWhitespace(match[2]).toLowerCase(),
  );
  assert.deepEqual(
    texts.sort(),
    ["1 field note", "1 field note", "2 field notes"],
    "count links read like sentences with correct plural grammar",
  );
  assert.ok(
    !html.includes("No articles have been published yet."),
    "homepage empty state gone once an article exists",
  );
});

test("topics index counts articles and topic pages list them", () => {
  const directory = readBuilt("topics/index.html");
  const directoryText = collapseWhitespace(directory);
  assert.ok(
    /2\s+articles\b/.test(directoryText),
    "directory count shows the two-article topic",
  );
  assert.ok(
    /1\s+article\b/.test(directoryText),
    "single-article topics keep singular grammar",
  );
  for (const slug of [
    "systems-tooling",
    "ai-engineering",
    "reverse-engineering",
  ]) {
    assert.ok(
      directory.includes(`href="/topics/${slug}/"`),
      `non-empty topic ${slug} listed`,
    );
  }
  assert.ok(
    !directory.includes('href="/topics/security-research/"'),
    "empty topics stay hidden from the directory",
  );
  for (const slug of ["systems-tooling", "ai-engineering"]) {
    const page = readBuilt(`topics/${slug}/index.html`);
    assert.ok(
      page.includes('href="/articles/temp-integration-published-note/"'),
      `${slug} links its fixture article`,
    );
  }
  const reverse = readBuilt("topics/reverse-engineering/index.html");
  assert.ok(
    reverse.includes('href="/articles/understanding-windows-executables/"'),
    "reverse-engineering links the published article",
  );
  const empty = readBuilt("topics/security-research/index.html");
  assert.ok(
    empty.includes("No articles have been published in this topic yet"),
    "empty topic page stays honest even when other topics fill",
  );
});

test("archive groups the article under its publication year", () => {
  const html = readBuilt("archive/index.html");
  assert.ok(
    html.includes('id="year-2026"') &&
      html.includes('aria-labelledby="year-2026"'),
    "2026 year section present",
  );
  assert.ok(
    !html.includes('class="archive__jump"'),
    "the year jump list only appears once there are multiple years",
  );
  assert.ok(
    html.includes('href="/articles/temp-integration-published-note/"'),
    "fixture article card listed under its year",
  );
  assert.ok(
    html.includes('href="/articles/understanding-windows-executables/"'),
    "published article card listed under its year",
  );
  assert.ok(
    !html.includes("No articles have been published yet."),
    "archive empty state gone",
  );
});

test("search index exposes exactly the published articles, newest first", () => {
  const payload = JSON.parse(readBuilt("search-index.json"));
  assert.deepEqual(
    payload.articles.map((entry) => entry.slug),
    ["understanding-windows-executables", SLUG],
    "both published articles in newest-first order",
  );
  const real = payload.articles[0];
  assert.equal(
    real.title,
    "Windows Executable Analysis: PE Format and Runtime",
  );
  assert.equal(real.date, "2026-10-17");
  const fixture = payload.articles[1];
  assert.equal(fixture.title, TITLE);
  assert.deepEqual(fixture.topics, [
    topicLabel("systems-tooling"),
    topicLabel("ai-engineering"),
  ]);
  assert.equal(fixture.date, "2026-06-01");
  for (const marker of DRAFT_MARKERS) {
    assert.ok(!JSON.stringify(payload).includes(marker), `no ${marker}`);
  }
});
