import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { AUTHOR_GITHUB } from "../src/consts.ts";
import { APPROVED_TOPICS } from "../src/lib/topics.ts";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const SITE = "https://blog.adithiyan.me";

const publicPages = [
  "index.html",
  "articles/index.html",
  "topics/index.html",
  "archive/index.html",
  "about/index.html",
  "search/index.html",
  "colophon/index.html",
  "404.html",
  ...APPROVED_TOPICS.map((slug) => `topics/${slug}/index.html`),
];

function read(relative) {
  const path = join(distDir, relative);
  if (!existsSync(path)) {
    assert.fail(`${relative} missing - run \`npm run build\` first`);
  }
  return readFileSync(path, "utf8");
}

function graphFor(html) {
  const scripts = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ];
  assert.equal(scripts.length, 1, "exactly one JSON-LD graph per page");
  return JSON.parse(scripts[0][1])["@graph"];
}

test("every public page exposes one linked site graph", () => {
  for (const relative of publicPages) {
    const graph = graphFor(read(relative));
    const node = (type) =>
      graph.find((candidate) => candidate["@type"] === type);

    const person = node("Person");
    const website = node("WebSite");
    const blog = node("Blog");

    assert.ok(person, `${relative}: Person node`);
    assert.ok(website, `${relative}: WebSite node`);
    assert.ok(blog, `${relative}: Blog node`);
    assert.equal(person["@id"], `${SITE}/#person`, `${relative}: person id`);
    assert.equal(person.url, `${SITE}/about/`, `${relative}: person URL`);
    assert.ok(
      person.sameAs.includes(AUTHOR_GITHUB),
      `${relative}: public author profile is linked`,
    );
    assert.equal(website["@id"], `${SITE}/#website`, `${relative}: site id`);
    assert.equal(website.url, `${SITE}/`, `${relative}: site URL`);
    assert.equal(blog["@id"], `${SITE}/#blog`, `${relative}: blog id`);
    assert.equal(blog.isPartOf["@id"], website["@id"]);
    assert.equal(website.publisher["@id"], person["@id"]);
    assert.equal(website.name, "Technical Fieldnotes");
    assert.ok(
      !("potentialAction" in website),
      `${relative}: retired SearchAction markup stays out`,
    );

    const ids = graph.map((candidate) => candidate["@id"]).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${relative}: unique node ids`);
  }
});

test("indexable pages are self-canonical and carry social preview metadata", () => {
  const indexable = publicPages.filter(
    (relative) =>
      relative !== "search/index.html" &&
      relative !== "404.html" &&
      !["ai-engineering", "security-research", "experiments-fieldnotes"].some(
        (slug) => relative === `topics/${slug}/index.html`,
      ),
  );

  for (const relative of indexable) {
    const html = read(relative);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical, `${relative}: canonical URL`);
    assert.equal(
      canonical,
      `${SITE}/${relative.replace(/index\.html$/, "")}`,
      `${relative}: canonical is self-referencing`,
    );
    assert.ok(
      html.includes(
        'name="robots" content="index, follow, max-image-preview:large"',
      ),
      `${relative}: indexable with large image previews`,
    );
    assert.ok(
      html.includes('name="twitter:card" content="summary_large_image"'),
      `${relative}: large social card`,
    );
    assert.ok(
      html.includes('property="og:image:secure_url"'),
      `${relative}: secure social image`,
    );
    assert.ok(
      html.includes('name="twitter:image"'),
      `${relative}: Twitter image`,
    );
    assert.ok(
      html.includes('name="author" content="Adithiyan V."'),
      `${relative}: author metadata`,
    );
    const description = html.match(
      /<meta name="description" content="([^"]+)"/,
    )?.[1];
    assert.ok(
      description && description.length >= 50 && description.length <= 165,
      `${relative}: description is usefully sized`,
    );
  }
});

test("search and empty topic pages stay out of the index", () => {
  for (const relative of [
    "search/index.html",
    "topics/ai-engineering/index.html",
    "topics/security-research/index.html",
    "topics/experiments-fieldnotes/index.html",
  ]) {
    const html = read(relative);
    assert.ok(
      html.includes('name="robots" content="noindex, follow"'),
      `${relative}: noindex, follow`,
    );
  }

  const search = read("search/index.html");
  assert.ok(
    search.includes('property="og:type" content="website"'),
    "search remains shareable even when noindexed",
  );
  const headers = readFileSync(join(distDir, "_headers"), "utf8");
  assert.match(
    headers,
    /\/search-index\.json\s+X-Robots-Tag: noindex/,
    "search index JSON is noindexed",
  );
});

test("article markup matches the visible content and its evidence", () => {
  const index = JSON.parse(read("search-index.json"));
  const entry = index.articles[0];
  const relative = `articles/${entry.slug}/index.html`;
  const html = read(relative);
  const graph = graphFor(html);
  const node = (type) => graph.find((candidate) => candidate["@type"] === type);
  const article = node("BlogPosting");
  const breadcrumb = node("BreadcrumbList");
  const person = node("Person");

  assert.ok(article, "BlogPosting node present");
  assert.ok(breadcrumb, "BreadcrumbList node present");
  const h1 = html.match(/<h1 class="article__title">([^<]+)<\/h1>/)?.[1];
  const visibleDate = html.match(/<time datetime="([^"]+)"/)?.[1];
  assert.equal(article.headline, h1, "schema headline matches the H1");
  assert.ok(
    article.datePublished.startsWith(visibleDate ?? "missing-date"),
    "schema date matches the visible publication date",
  );
  assert.equal(article.author["@id"], person["@id"]);
  assert.equal(article.publisher["@id"], person["@id"]);
  assert.equal(article.articleSection, "Reverse Engineering");
  assert.match(article.keywords, /Systems & Tooling/);
  assert.equal(
    article.mainEntityOfPage["@id"],
    `${SITE}/${relative.replace("index.html", "")}`,
  );
  assert.deepEqual(article.image, [`${SITE}/og.png`]);
  assert.ok(article.wordCount > 1000, "word count is recorded");
  assert.match(article.timeRequired, /^PT\d+M$/);
  assert.equal(article.isAccessibleForFree, true);
  assert.equal(article.citation.length, 7, "all references become citations");
  assert.ok(!("dateModified" in article), "no revision date is emitted");
  assert.equal(
    html.includes('property="article:section" content="Reverse Engineering"'),
    true,
    "Open Graph article section is present",
  );
  assert.match(html, /property="article:tag" content="Systems &amp; Tooling"/);
  assert.match(
    html,
    /property="article:author" content="https:\/\/blog\.adithiyan\.me\/about\/"/,
  );
  assert.match(html, /href="\/about\/" rel="author"/);
  assert.deepEqual(
    breadcrumb.itemListElement.map((item) => item.name),
    ["Home", "Articles", entry.title],
  );
});

test("the topic directory is a linked collection, not a dead end", () => {
  const graph = graphFor(read("topics/index.html"));
  const collection = graph.find(
    (candidate) => candidate["@type"] === "CollectionPage",
  );

  assert.ok(collection, "topics index has a CollectionPage");
  assert.equal(collection.url, `${SITE}/topics/`);
  assert.equal(collection.mainEntity.numberOfItems, 2);
  assert.deepEqual(
    collection.mainEntity.itemListElement.map((item) => item.name),
    ["Systems & Tooling", "Reverse Engineering"],
  );
  assert.equal(
    collection.mainEntity.itemListElement[1].item.url,
    `${SITE}/topics/reverse-engineering/`,
  );
});

test("crawl surfaces contain only canonical public pages", () => {
  const sitemap = read("sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  assert.ok(
    locs.includes(`${SITE}/articles/understanding-windows-executables/`),
  );
  assert.ok(locs.includes(`${SITE}/topics/reverse-engineering/`));
  assert.ok(!locs.includes(`${SITE}/search/`), "search is not a landing page");
  assert.ok(!sitemap.includes("404"), "404 stays out of the sitemap");
  assert.ok(!sitemap.includes("/r1phun73r/"), "admin desk stays out");
  for (const slug of [
    "ai-engineering",
    "security-research",
    "experiments-fieldnotes",
  ]) {
    assert.ok(
      !locs.some((loc) => loc.endsWith(`/topics/${slug}/`)),
      `empty topic ${slug} stays out`,
    );
  }

  const robots = read("robots.txt");
  assert.ok(robots.includes("Allow: /"));
  assert.ok(robots.includes("Disallow: /r1phun73r/"));
  assert.ok(robots.includes("Disallow: /search/?*"));
  assert.ok(robots.includes(`Sitemap: ${SITE}/sitemap.xml`));
});
