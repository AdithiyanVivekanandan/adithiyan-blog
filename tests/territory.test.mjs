import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { APPROVED_TOPICS, topicLabel } from "../src/lib/topics.ts";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));

const EMPTY_TOPICS = APPROVED_TOPICS.filter(
  (slug) => slug !== "systems-tooling",
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

test("populated region leads with a collection-derived count and links", () => {
  const html = readDist("index.html").replace(/\s+/g, " ");
  assert.ok(html.includes("territory--lead"), "populated region leads");
  assert.ok(
    html.includes(
      '<a href="/topics/systems-tooling/">Systems &amp; Tooling</a>',
    ),
    "populated region name links to its topic page",
  );
  assert.ok(html.includes("1 field note"), "live count is singular and exact");
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

test("article pipeline figure lists the real gate stages with valid anchors", () => {
  const html = readDist(
    "articles/repeatable-release-check-npm-node-test/index.html",
  );
  assert.ok(html.includes('<figure class="pipeline">'), "figure present");
  assert.ok(
    html.includes("seven stages in order"),
    "caption describes the sequence honestly",
  );

  const list =
    html.match(/<ol class="pipeline__stages">([\s\S]*?)<\/ol>/)?.[1] ?? "";
  assert.ok(list.length > 0, "ordered stage list present");

  const links = [...list.matchAll(/<a href="(#[^"]+)">([^<]+)<\/a>/g)];
  assert.deepEqual(
    links.map((link) => link[2]),
    [
      "format:check",
      "lint",
      "typecheck",
      "lint:secrets",
      "audit:deps",
      "build",
      "test",
    ],
    "exactly the seven stages the project runs, in chain order",
  );

  for (const [, fragment] of links) {
    assert.ok(
      html.includes(`id="${fragment.slice(1)}"`),
      `stage anchor ${fragment} resolves to a real section`,
    );
  }
});
