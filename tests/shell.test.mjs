import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const pages = [
  new URL("../dist/index.html", import.meta.url),
  new URL("../dist/articles/index.html", import.meta.url),
  new URL("../dist/search/index.html", import.meta.url),
  new URL("../dist/colophon/index.html", import.meta.url),
];

function readPage(url) {
  if (!existsSync(url)) {
    assert.fail(`${url.pathname} not found - run \`npm run build\` first`);
  }
  return readFileSync(url, "utf8");
}

function totalScriptBytes(html) {
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) ?? [];
  return scripts.reduce((sum, script) => sum + Buffer.byteLength(script), 0);
}

for (const page of pages) {
  const name = page.pathname.replace("/dist", "");

  test(`${name} has landmark structure and skip link`, () => {
    const html = readPage(page);
    assert.match(
      html,
      /<a class="skip-link" href="#main">Skip to main content<\/a>/,
    );
    assert.match(html, /<header class="site-header">/);
    assert.match(
      html,
      /<nav id="site-nav" class="site-nav" aria-label="Primary">/,
    );
    assert.match(html, /<footer class="site-footer">/);
    assert.match(html, /<nav aria-label="Footer">/);
  });

  test(`${name} ships a progressive theme toggle with accessible name`, () => {
    const html = readPage(page);
    assert.match(html, /<button\s+type="button"\s+class="theme-toggle"/);
    assert.match(html, /aria-label="Switch to (dark|light) theme"/);
    assert.ok(
      html.includes('localStorage.getItem("theme")'),
      "theme bootstrap must read the stored preference before paint",
    );
    assert.ok(
      html.includes('classList.add("js")'),
      "html.js gating class must be set before paint",
    );
  });

  test(`${name} loads no remote scripts and stays under the JS budget`, () => {
    const html = readPage(page);
    assert.ok(
      !/<script[^>]+src="https?:\/\//.test(html),
      "no remote script sources are allowed",
    );
    assert.ok(
      !/<script(?![^>]*(?:type="application\/ld\+json"|is:inline))[^>]*>\s*https?:\/\//.test(
        html,
      ),
      "no inline script may point at remote hosts",
    );
    const bytes = totalScriptBytes(html);
    assert.ok(
      bytes <= 10 * 1024,
      `total script payload ${bytes} bytes exceeds the 10 KB budget`,
    );
  });
}
