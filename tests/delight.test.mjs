import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function readDist(relative) {
  const path = `${distDir}/${relative}`;
  if (!existsSync(path)) {
    assert.fail(`${relative} not found - run \`npm run build\` first`);
  }
  return readFileSync(path, "utf8");
}

function rulesFor(css, prefix) {
  const rules = [];
  const pattern = new RegExp(`(${prefix}[^{]*)\\{([^}]*)\\}`, "g");
  for (const match of css.matchAll(pattern)) {
    rules.push({ selector: match[1].trim(), body: match[2] });
  }
  return rules;
}

test("field note easter egg is present, hidden by default and accessible", () => {
  const css = readFileSync(`${repoRoot}/src/styles/global.css`, "utf8");
  for (const relative of ["index.html", "articles/index.html", "404.html"]) {
    const html = readDist(relative);
    assert.match(
      html,
      /<div[^>]*\sid="field-note"[^>]*role="dialog"[^>]*\shidden/,
      `${relative}: easter egg card exists and starts hidden`,
    );
    assert.ok(
      html.includes('aria-label="A small field note"'),
      `${relative}: card carries an accessible name`,
    );
    assert.ok(
      html.includes('class="field-note__close"'),
      `${relative}: card carries a labelled close control`,
    );
    const script = html.match(
      /<script>\s*\(function \(\) \{\s*(?:var|const|let) card = document\.getElementById\("field-note"\)[\s\S]*?<\/script>/,
    )?.[0];
    assert.ok(script, `${relative}: easter egg script is present`);
    assert.ok(
      script.includes('"keydown"') &&
        script.includes('"input, textarea, select"'),
      `${relative}: script keys the buffer listener and skips editable fields`,
    );
    assert.ok(
      script.includes('event.key === "Escape"'),
      `${relative}: Escape closes the card`,
    );
    assert.ok(
      script.includes('target.closest("input, textarea, select")') &&
        script.includes("target.isContentEditable"),
      `${relative}: keystrokes inside editable fields are never captured`,
    );
    assert.ok(
      script.includes("lastFocus.focus()"),
      `${relative}: focus returns to the original element on close`,
    );
    assert.ok(
      !/(?:fetch|XMLHttpRequest|localStorage|navigator\.sendBeacon|setTimeout|setInterval)\s*\(/.test(
        script,
      ),
      `${relative}: the card collects nothing and uses no timers or storage`,
    );
  }
  const fieldNoteRules = rulesFor(css, "\\.field-note");
  assert.ok(
    fieldNoteRules.length > 0,
    "field note styles are defined once in global.css",
  );
  for (const rule of rulesFor(
    css,
    "@media \\(prefers-reduced-motion: reduce\\)",
  )) {
    assert.ok(
      rule.body.includes("transition-duration: 0.01ms"),
      "reduced motion neutralizes transitions",
    );
  }
  for (const rule of fieldNoteRules) {
    if (rule.selector.includes("__close")) {
      continue;
    }
    assert.ok(
      !/transition\s*:|animation\s*:|@keyframes/.test(rule.body),
      `.field-note reveal styles must be static (no motion): ${rule.selector}`,
    );
  }
  const closeRule = fieldNoteRules.find((rule) =>
    rule.selector.includes("__close"),
  );
  assert.ok(closeRule, "close control is styled");
  assert.ok(
    closeRule.body.length > 0,
    "close control carries its functional hover state",
  );
});

test("404 index-card detail is decorative, static and theme-aware", () => {
  const css = readFileSync(`${repoRoot}/src/styles/global.css`, "utf8");
  const html = readDist("404.html");
  assert.match(
    html,
    /<div[^>]*class="page-404-card"[^>]*aria-hidden="true"/,
    "the card is decorative and hidden from assistive technology",
  );
  const rules = rulesFor(css, "\\.page-404-card");
  assert.ok(rules.length > 0, "404 card has its own styles");
  for (const rule of rules) {
    assert.ok(
      !/transition\s*:|animation\s*:|@keyframes/.test(rule.body),
      `404 card styles must be static: ${rule.selector}`,
    );
  }
  assert.ok(
    rules.some((rule) => rule.body.includes("var(--color-surface)")),
    "card uses design tokens, not one-off colors",
  );
});

test("colophon states only implemented, verifiable facts", () => {
  const html = readDist("colophon/index.html");
  assert.match(html, /<title>Colophon — Technical Fieldnotes<\/title>/);
  assert.ok(
    html.includes("validated against a schema at build time"),
    "describes the real content validation",
  );
  assert.ok(
    html.includes("No remote fonts") || html.includes("no remote fonts"),
    "describes the font loading policy truthfully",
  );
  assert.ok(
    html.includes("No analytics, no tracking, no third-party scripts"),
    "states the actual privacy posture",
  );
  assert.ok(html.includes('href="/rss.xml"'), "links the real RSS feed");
  assert.ok(
    html.includes('href="/about/"'),
    "points readers at the correction policy",
  );
});
