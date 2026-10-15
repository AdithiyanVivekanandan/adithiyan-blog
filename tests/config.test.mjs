import assert from "node:assert/strict";
import { test } from "node:test";

import config from "../astro.config.mjs";

test("site builds as static output", () => {
  assert.equal(config.output, "static");
});

test("site declares an absolute https URL", () => {
  assert.equal(typeof config.site, "string");
  const url = new URL(config.site);
  assert.equal(url.protocol, "https:");
  assert.ok(url.hostname.length > 0, "site URL must include a hostname");
});
