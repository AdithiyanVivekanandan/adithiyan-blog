import assert from "node:assert/strict";
import { test } from "node:test";

import { ARTICLE_TYPES, articleTypeLabel } from "../src/lib/article-type.ts";

test("the approved article-type set matches the editorial variants", () => {
  assert.deepEqual(ARTICLE_TYPES, [
    "tutorial",
    "investigation",
    "experiment",
    "opinion",
    "fieldnote",
    "reference",
  ]);
});

test("every article type resolves to a human label", () => {
  for (const type of ARTICLE_TYPES) {
    assert.match(articleTypeLabel(type), /^[A-Z][A-Za-z ]+$/);
  }
  assert.equal(articleTypeLabel("investigation"), "Investigation");
  assert.equal(articleTypeLabel("fieldnote"), "Field note");
});

test("articles without a declared type read as field notes", () => {
  assert.equal(articleTypeLabel(undefined), "Field note");
});
