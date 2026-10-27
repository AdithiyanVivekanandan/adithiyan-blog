import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const adminPath = join(distDir, "r1phun73r", "index.html");

function readDist(relative) {
  const path = join(distDir, relative);
  if (!existsSync(path)) {
    assert.fail(`${relative} not found - run \`npm run build\` first`);
  }
  return readFileSync(path, "utf8");
}

test("the admin desk is built as a private, standalone route", () => {
  assert.ok(existsSync(adminPath), "dist must contain /r1phun73r/index.html");
  const html = readFileSync(adminPath, "utf8");

  assert.match(
    html,
    /<meta name="robots" content="noindex, nofollow"\s*\/?>/,
    "admin page must request no indexing",
  );
  assert.match(
    html,
    /<title>Publishing desk · Technical Fieldnotes<\/title>/,
    "admin page has its own title",
  );
  assert.ok(
    html.includes("Publishing desk") && html.includes('id="admin-app"'),
    "admin shell is present",
  );
  assert.ok(
    !html.includes('class="site-header"') &&
      !html.includes('class="site-footer"') &&
      !html.includes('class="skip-link"'),
    "admin page must not reuse public site chrome",
  );
  assert.ok(
    !html.includes('rel="alternate"') &&
      !html.includes('property="og:image"') &&
      !html.includes('rel="canonical"'),
    "admin page must not advertise RSS, social previews or a canonical public URL",
  );
});

test("the admin desk ships no inline script and only bundled assets", () => {
  const html = readFileSync(adminPath, "utf8");
  const scriptTags = [...html.matchAll(/<script\b[^>]*>/g)].map(
    (match) => match[0],
  );
  assert.ok(scriptTags.length > 0, "admin behaviour is bundled");
  assert.ok(
    scriptTags.every((tag) => /\ssrc="\/_astro\//.test(tag)),
    "every admin script comes from a self-hosted bundled asset",
  );
  assert.equal(
    (html.match(/<script(?![^>]*\ssrc=)[^>]*>/g) ?? []).length,
    0,
    "no inline script appears in the built admin page",
  );
  assert.ok(
    html.includes('rel="stylesheet" href="/_astro/'),
    "admin page links bundled stylesheets",
  );
});

test("admin paths stay out of crawler and search outputs", () => {
  const robots = readDist("robots.txt");
  const sitemap = readDist("sitemap.xml");
  const search = readDist("search-index.json");
  assert.ok(robots.includes("Disallow: /r1phun73r/"));
  assert.ok(
    !sitemap.includes("/r1phun73r/"),
    "sitemap excludes the admin desk",
  );
  assert.ok(
    !search.includes("/r1phun73r/"),
    "search index excludes the admin desk",
  );
});
