import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { topicLabel } from "../src/lib/topics.ts";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));

const DRAFT_SLUG = "draft-fixture-leaked-token";
const DRAFT_TITLE = "Unpublished draft fixture";
const FUTURE_SLUG = "fixture-future-dated";
const FUTURE_TITLE = "Scheduled publication fixture";
const MARKERS = [
  "draft-canary-7f2e91",
  DRAFT_SLUG,
  "future-canary-5b8d31",
  FUTURE_SLUG,
  "windows-apis-malware-analysis-evidence",
  "Windows APIs for Malware Analysis",
  "Draft status — evidence pending",
  "VERIFY BEFORE PRACTICAL WORK",
];
const MARKER_TITLES = [DRAFT_TITLE, FUTURE_TITLE];

function readDist(relative) {
  const path = `${distDir}/${relative}`;
  if (!existsSync(path)) {
    assert.fail(`${relative} not found - run \`npm run build\` first`);
  }
  return readFileSync(path, "utf8");
}

test("search index endpoint publishes valid JSON using published content only", () => {
  const raw = readDist("search-index.json");
  const payload = JSON.parse(raw);
  assert.ok(Array.isArray(payload.articles), "index exposes an articles array");
  assert.equal(
    payload.articles.length,
    1,
    "exactly the published article appears in the index",
  );
  const [entry] = payload.articles;
  assert.equal(entry.slug, "understanding-windows-executables");
  assert.equal(entry.title, "Understanding Windows Executables");
  assert.deepEqual(entry.topics, [
    topicLabel("reverse-engineering"),
    topicLabel("systems-tooling"),
  ]);
  assert.equal(entry.date, "2026-10-17");
  assert.ok(
    !payload.articles.some(
      (candidate) =>
        MARKER_TITLES.includes(candidate.title) ||
        MARKERS.includes(candidate.slug) ||
        (typeof candidate.date === "string" &&
          candidate.date.startsWith("2099")),
    ),
    "draft and scheduled fixtures must not enter the index",
  );
});

test("search page offers a labelled form, honest no-JS state and no fake results", () => {
  const html = readDist("search/index.html");
  assert.match(html, /<h1 class="page-title">Search<\/h1>/);
  assert.ok(
    html.includes('<label class="search__label" for="search-input">'),
    "input has a persistent visible label",
  );
  assert.ok(
    html.includes('name="q"') && html.includes('type="search"'),
    "query input is a real search-typed field",
  );
  assert.match(
    html,
    /<form class="search" role="search" method="get" action="\/search\/">/,
    "form is a navigable search landmark with a GET action",
  );
  assert.ok(
    html.includes("<noscript>"),
    "no-JS readers get an honest alternative",
  );
  assert.ok(
    html.includes('href="/articles/"'),
    "no-JS fallback links the article index",
  );
  assert.ok(
    html.includes('class="search__status" role="status" hidden>'),
    "status region starts hidden with no fake results",
  );
  assert.ok(
    html.includes('class="search__results" hidden>'),
    "result list starts empty and hidden",
  );
  const script = [...html.matchAll(/<script>[\s\S]*?<\/script>/g)]
    .map((match) => match[0])
    .find((text) => text.includes("/search-index.json"));
  assert.ok(script, "search behaviour ships as inline progressive JS");
  assert.ok(
    script.includes('fetch("/search-index.json")'),
    "loader fetches the build-generated index endpoint",
  );
  assert.ok(
    !script.includes("innerHTML") && !script.includes("outerHTML"),
    "query echo and results use safe DOM text mutation only",
  );
  assert.ok(
    script.includes("URLSearchParams(window.location.search)"),
    "a shared ?q= query is restored on load",
  );
  assert.ok(
    script.includes("Intl.DateTimeFormat") && script.includes("en-GB"),
    "result dates use the same en-GB format as the rest of the site",
  );
  assert.match(
    html,
    /<title>Search — Technical Fieldnotes<\/title>/,
    "page title follows the site convention",
  );
});

test("header exposes search as a labelled navigation destination", () => {
  const html = readDist("index.html");
  assert.ok(
    html.includes('href="/search/"'),
    "primary navigation must offer search on every page",
  );
});

test("search assets keep draft and scheduled fixture identifiers out", () => {
  const rawIndex = readDist("search-index.json");
  const page = readDist("search/index.html");
  for (const marker of [...MARKERS, ...MARKER_TITLES]) {
    assert.ok(!rawIndex.includes(marker), `index must not contain ${marker}`);
    assert.ok(!page.includes(marker), `search page must not contain ${marker}`);
  }
});
