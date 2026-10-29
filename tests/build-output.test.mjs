import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import {
  SITE_DESCRIPTION,
  SITE_HOME_TITLE,
  SITE_TITLE,
} from "../src/consts.ts";

const indexPath = new URL("../dist/index.html", import.meta.url);

function readBuild() {
  if (!existsSync(indexPath)) {
    assert.fail(
      "dist/index.html not found - run `npm run build` before `npm test`",
    );
  }
  return readFileSync(indexPath, "utf8");
}

test("homepage has one root element with declared language", () => {
  const html = readBuild();
  assert.match(html, /<html lang="en">/);
  const htmlCount = (html.match(/<html[\s>]/g) ?? []).length;
  assert.equal(htmlCount, 1, "expected exactly one <html> element");
});

test("homepage has a single h1 and the configured title and description", () => {
  const html = readBuild();
  const h1Count = (html.match(/<h1[\s>]/g) ?? []).length;
  assert.equal(h1Count, 1, "expected exactly one <h1>");
  assert.ok(
    html.includes(`<title>${SITE_HOME_TITLE.replaceAll("&", "&amp;")}</title>`),
    "built title must carry the search-facing homepage title",
  );
  assert.ok(
    html.includes(`<h1>${SITE_TITLE}</h1>`),
    "visible masthead keeps the publication name",
  );
  assert.ok(
    html.includes(SITE_DESCRIPTION),
    "built meta description must match SITE_DESCRIPTION",
  );
  assert.match(html, /<meta name="description" content="[^"]+">/);
});

test("homepage uses semantic main landmark with skip target", () => {
  const html = readBuild();
  assert.match(html, /<main id="main" tabindex="-1">/);
});
