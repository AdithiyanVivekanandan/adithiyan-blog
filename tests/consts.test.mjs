import assert from "node:assert/strict";
import { test } from "node:test";

import { SITE_DESCRIPTION, SITE_TITLE } from "../src/consts.ts";

test("site title is a non-empty, trimmed string", () => {
  assert.equal(typeof SITE_TITLE, "string");
  assert.equal(SITE_TITLE, SITE_TITLE.trim());
  assert.ok(SITE_TITLE.length > 0, "site title must not be empty");
});

test("site description is informative and bounded", () => {
  assert.equal(typeof SITE_DESCRIPTION, "string");
  assert.equal(SITE_DESCRIPTION, SITE_DESCRIPTION.trim());
  const length = SITE_DESCRIPTION.length;
  assert.ok(
    length >= 20 && length <= 400,
    `description length ${length} outside 20-400 character range`,
  );
});
