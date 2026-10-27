import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const articlesDir = fileURLToPath(
  new URL("../src/content/articles", import.meta.url),
);

// Raw HTML only protects against injection when the element inventory is
// closed. The publication is maintained by a trusted, currently sole author
// (see CONTRIBUTING.md), so the finding is informational today, but a build-
// time guard makes the trusted-author assumption explicit and testable: if a
// contributor is ever added, dangerous HTML cannot silently pass the build.
const ALLOWED_RAW_TAGS = new Set([
  "figure",
  "figcaption",
  "a",
  "img",
  "code",
  "kbd",
  "details",
  "summary",
  "span",
  "strong",
  "em",
  "abbr",
]);

const FORBIDDEN_TAG_PATTERN =
  /<\s*(script|iframe|object|embed|meta|link|style|form|input|button|textarea|video|audio|source|base)\b/i;
const EVENT_HANDLER_PATTERN = /\son[a-z]+\s*=\s*["']/i;
const JAVASCRIPT_URI_PATTERN = /(?:href|src)\s*=\s*["']\s*(?:javascript|data)/i;

const articles = readdirSync(articlesDir).filter((name) =>
  name.endsWith(".md"),
);

test("article corpus exists to guard", () => {
  assert.ok(articles.length > 0, "expected raw article files to scan");
});

for (const name of articles) {
  const source = readFileSync(join(articlesDir, name), "utf8");

  // Body only: frontmatter YAML is not rendered as HTML.
  const frontmatterEnd = source.indexOf("\n---", 4);
  const body =
    frontmatterEnd === -1 ? source : source.slice(frontmatterEnd + 4);

  // Code samples routinely contain angle brackets (e.g. #include <stdio.h>).
  // Strip fenced blocks and inline code spans before scanning for markup.
  const prose = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

  test(`${name}: raw HTML keeps to the approved element inventory`, () => {
    const tags = [...prose.matchAll(/<\s*\/?\s*([a-zA-Z][\w-]*)/g)].map(
      (match) => match[1].toLowerCase(),
    );
    const unapproved = tags.filter((tag) => !ALLOWED_RAW_TAGS.has(tag));
    assert.deepEqual(
      [...new Set(unapproved)],
      [],
      `unapproved raw HTML elements used: ${[...new Set(unapproved)].join(", ")}`,
    );
  });

  test(`${name}: no dangerous raw HTML constructs`, () => {
    assert.ok(
      !FORBIDDEN_TAG_PATTERN.test(prose),
      "executable or container tags must not appear in trusted Markdown",
    );
    assert.ok(
      !EVENT_HANDLER_PATTERN.test(prose),
      "inline event handlers must not appear in trusted Markdown",
    );
    assert.ok(
      !JAVASCRIPT_URI_PATTERN.test(prose),
      "javascript:/data: URIs must not appear in href/src attributes",
    );
  });
}
