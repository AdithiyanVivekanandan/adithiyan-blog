import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { APPROVED_TOPICS, topicLabel } from "../src/lib/topics.ts";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));

const PUBLISHED_TOPICS = ["reverse-engineering", "systems-tooling"];

const EMPTY_TOPICS = APPROVED_TOPICS.filter(
  (slug) => !PUBLISHED_TOPICS.includes(slug),
);

function readDist(relative) {
  const path = join(distDir, relative);
  if (!existsSync(path)) {
    assert.fail(`${relative} not found - run \`npm run build\` first`);
  }
  return readFileSync(path, "utf8");
}

function escapedLabel(slug) {
  return topicLabel(slug).replace(/&/g, "&amp;");
}

test("territory map renders the exact approved taxonomy in stable order", () => {
  const html = readDist("index.html");
  assert.ok(
    html.includes('aria-labelledby="territory-heading"'),
    "map section is labelled",
  );
  const names = [
    ...html.matchAll(/<h3 class="territory__name">([\s\S]*?)<\/h3>/g),
  ].map((match) => match[1].replace(/<[^>]+>/g, "").trim());
  assert.deepEqual(
    names,
    APPROVED_TOPICS.map(escapedLabel),
    "all five approved topics in taxonomy order, none invented or omitted",
  );
});

test("the first populated region in taxonomy order leads the map", () => {
  const html = readDist("index.html");
  assert.equal(
    (html.match(/territory--lead/g) ?? []).length,
    1,
    "exactly one lead region",
  );
  assert.match(
    html,
    /territory--lead[\s\S]{0,400}?href="\/topics\/systems-tooling\/"/,
    "the lead is the first populated region in taxonomy order",
  );
  assert.match(
    html,
    /<p class="territory__count">\s*<a href="\/topics\/systems-tooling\/">/,
    "populated regions expose a count link",
  );
  assert.match(
    html,
    /<p class="territory__count">\s*<a href="\/topics\/reverse-engineering\/">/,
    "every populated region links its topic page",
  );
});

test("empty regions link nowhere and report honest empty states", () => {
  const html = readDist("index.html");
  for (const slug of EMPTY_TOPICS) {
    assert.ok(
      !html.includes(`href="/topics/${slug}/"`),
      `empty topic ${slug} must not link anywhere from the map`,
    );
  }
  assert.equal(
    (html.match(/Surveyed — no field notes yet/g) ?? []).length,
    EMPTY_TOPICS.length,
    "every empty region states it plainly",
  );
  assert.ok(
    html.includes("territory--empty"),
    "empty regions carry the empty marker",
  );
});

test("article detail routes exist only for published articles", () => {
  const entries = readdirSync(join(distDir, "articles"), {
    withFileTypes: true,
  });
  const routes = entries.map((entry) => entry.name).sort();
  assert.deepEqual(
    routes,
    ["index.html", "understanding-windows-executables"],
    "articles/ contains the index and exactly the published article",
  );
  assert.ok(
    !existsSync(
      join(distDir, "articles", "windows-apis-malware-analysis-evidence"),
    ),
    "draft articles must not generate detail routes",
  );
});
