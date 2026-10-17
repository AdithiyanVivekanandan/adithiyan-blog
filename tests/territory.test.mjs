import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { APPROVED_TOPICS, topicLabel } from "../src/lib/topics.ts";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));

const EMPTY_TOPICS = [...APPROVED_TOPICS];

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

test("no region leads while the publication is empty", () => {
  const html = readDist("index.html");
  assert.ok(
    !html.includes("territory--lead"),
    "no lead region without published articles",
  );
  assert.ok(
    !/<p class="territory__count">\s*<a/.test(html),
    "no count links without published articles",
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

test("no article detail routes are generated while unpublished", () => {
  const entries = readdirSync(join(distDir, "articles"), {
    withFileTypes: true,
  });
  const routes = entries.map((entry) => entry.name).sort();
  assert.deepEqual(
    routes,
    ["index.html"],
    "articles/ must contain only the index while no articles are published",
  );
});
