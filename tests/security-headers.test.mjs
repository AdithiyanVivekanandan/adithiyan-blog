import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const publicHeaders = readFileSync(
  new URL("../public/_headers", import.meta.url),
  "utf8",
);
const distHeadersText = (() => {
  try {
    return readFileSync(new URL("../dist/_headers", import.meta.url), "utf8");
  } catch {
    return null;
  }
})();

function parseHeaders(text) {
  const rules = [];
  for (const block of text.split(/(?:\r?\n){2,}/)) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    if (lines.length === 0) continue;
    const [path, ...headers] = lines;
    const parsed = {};
    for (const header of headers) {
      const separator = header.indexOf(":");
      assert.ok(separator > 0, `header line must be "Name: value": ${header}`);
      const name = header.slice(0, separator).trim().toLowerCase();
      const value = header.slice(separator + 1).trim();
      parsed[name] = value;
    }
    rules.push({ path, headers: parsed });
  }
  return rules;
}

const rules = parseHeaders(publicHeaders);
const universalRule = rules.find((rule) => rule.path === "/*");
assert.ok(universalRule, 'public/_headers must contain a "/*" rule');
const astroRule = rules.find((rule) => rule.path === "/_astro/*");
assert.ok(astroRule, 'public/_headers must contain a "/_astro/*" rule');
const adminRule = rules.find((rule) => rule.path === "/r1phun73r/*");
assert.ok(adminRule, 'public/_headers must contain a "/r1phun73r/*" rule');

const universal = universalRule.headers;
const csp = universal["content-security-policy"];

test("CSP is present and self-hosted only", () => {
  assert.ok(csp, "Content-Security-Policy must be set");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  assert.ok(
    !/(^|[\s;])(script-src|style-src|img-src|connect-src|font-src)[^;]*('unsafe-eval'|\*|https?:)/.test(
      csp,
    ),
    "CSP must not open script/style/source lists to unsafe-eval, *, or arbitrary origins",
  );
});

test("frame, sniffing and referrer protections are set", () => {
  assert.equal(universal["x-frame-options"], "DENY");
  assert.equal(universal["x-content-type-options"], "nosniff");
  assert.equal(universal["referrer-policy"], "strict-origin-when-cross-origin");
});

test("Permissions-Policy denies powerful capabilities", () => {
  const policy = universal["permissions-policy"] ?? "";
  for (const capability of ["camera", "microphone", "geolocation"]) {
    const directive = policy
      .split(",")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${capability}=`));
    assert.ok(
      directive === `${capability}=()`,
      `Permissions-Policy must deny ${capability}`,
    );
  }
});

test("HSTS is moderate and stays scoped to this hostname", () => {
  const hsts = universal["strict-transport-security"];
  assert.ok(hsts, "Strict-Transport-Security must be set");
  assert.match(hsts, /max-age=\d+/);
  const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1]);
  assert.ok(
    maxAge >= 15552000 && maxAge <= 31536000,
    `HSTS max-age ${maxAge} should stay between 180 and 365 days`,
  );
  assert.ok(
    !/includeSubDomains/i.test(hsts),
    "HSTS must not enable includeSubDomains casually",
  );
  assert.ok(!/preload/i.test(hsts), "HSTS must not request preload casually");
});

test("the admin desk is private, uncached, unindexed and stricter than the site", () => {
  const headers = adminRule.headers;
  const adminCsp = headers["content-security-policy"];
  assert.ok(adminCsp, "admin CSP must be set");
  assert.match(adminCsp, /default-src 'self'/);
  assert.match(adminCsp, /script-src 'self'(?:;|$)/);
  assert.match(adminCsp, /style-src 'self'(?:;|$)/);
  assert.match(adminCsp, /img-src 'self' blob: data:/);
  assert.match(adminCsp, /frame-ancestors 'none'/);
  assert.ok(
    !/unsafe-inline|unsafe-eval|\*|https?:/.test(adminCsp),
    "admin CSP must not relax script/style/source lists",
  );
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["x-robots-tag"], "noindex, nofollow");
  assert.equal(headers["referrer-policy"], "no-referrer");
  assert.match(headers["cache-control"], /no-store/);
});

test("fingerprinted assets cache immutably, HTML stays revalidating", () => {
  assert.match(
    universal["cache-control"],
    /max-age=0.*must-revalidate/,
    "HTML must revalidate, never cache long",
  );
  assert.ok(astroRule.headers["cache-control"], "/_astro/* sets a cache");
  assert.match(
    astroRule.headers["cache-control"],
    /max-age=31536000/,
    "fingerprinted assets cache one year",
  );
  assert.match(
    astroRule.headers["cache-control"],
    /immutable/,
    "fingerprinted assets are immutable",
  );
});

if (distHeadersText !== null) {
  test("dist/_headers mirrors public/_headers exactly", () => {
    assert.equal(distHeadersText, publicHeaders);
  });
}
