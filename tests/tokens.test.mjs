import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const tokensCss = readFileSync(
  new URL("../src/styles/tokens.css", import.meta.url),
  "utf8",
);

function tokenValue(selectorBlock, name) {
  const match = selectorBlock.match(
    new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`),
  );
  assert.ok(match, `expected token ${name} to be a 6-digit hex color`);
  return match[1].toLowerCase();
}

function themeBlock(selector) {
  const start = tokensCss.indexOf(selector);
  assert.ok(start !== -1, `expected selector ${selector} in tokens.css`);
  const end = tokensCss.indexOf("}", start);
  return tokensCss.slice(start, end);
}

function srgbChannel(value) {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b)
  );
}

function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

const light = themeBlock(":root {");
const dark = themeBlock(':root[data-theme="dark"] {');
const darkFallback = themeBlock(':root:not([data-theme="light"]) {');

const lightTokens = {
  canvas: tokenValue(light, "--color-canvas"),
  surface: tokenValue(light, "--color-surface"),
  surfaceRaised: tokenValue(light, "--color-surface-raised"),
  surfaceMuted: tokenValue(light, "--color-surface-muted"),
  textPrimary: tokenValue(light, "--color-text-primary"),
  textSecondary: tokenValue(light, "--color-text-secondary"),
  accent: tokenValue(light, "--color-accent"),
  accentText: tokenValue(light, "--color-accent-text"),
  highlight: tokenValue(light, "--color-highlight"),
  highlightText: tokenValue(light, "--color-highlight-text"),
  focusRing: tokenValue(light, "--color-focus-ring"),
  success: tokenValue(light, "--color-success"),
  warning: tokenValue(light, "--color-warning"),
  error: tokenValue(light, "--color-error"),
  codeBg: tokenValue(light, "--color-code-bg"),
  codeBar: tokenValue(light, "--color-code-bar"),
  codeBorder: tokenValue(light, "--color-code-border"),
  codeText: tokenValue(light, "--color-code-text"),
  codeMuted: tokenValue(light, "--color-code-muted"),
  codeSuccess: tokenValue(light, "--color-code-success"),
  codeError: tokenValue(light, "--color-code-error"),
};

const darkTokens = {
  canvas: tokenValue(dark, "--color-canvas"),
  surface: tokenValue(dark, "--color-surface"),
  surfaceRaised: tokenValue(dark, "--color-surface-raised"),
  surfaceMuted: tokenValue(dark, "--color-surface-muted"),
  textPrimary: tokenValue(dark, "--color-text-primary"),
  textSecondary: tokenValue(dark, "--color-text-secondary"),
  accent: tokenValue(dark, "--color-accent"),
  accentText: tokenValue(dark, "--color-accent-text"),
  highlight: tokenValue(dark, "--color-highlight"),
  highlightText: tokenValue(dark, "--color-highlight-text"),
  focusRing: tokenValue(dark, "--color-focus-ring"),
  success: tokenValue(dark, "--color-success"),
  warning: tokenValue(dark, "--color-warning"),
  error: tokenValue(dark, "--color-error"),
  codeBg: tokenValue(dark, "--color-code-bg"),
  codeBar: tokenValue(dark, "--color-code-bar"),
  codeBorder: tokenValue(dark, "--color-code-border"),
  codeText: tokenValue(dark, "--color-code-text"),
  codeMuted: tokenValue(dark, "--color-code-muted"),
  codeSuccess: tokenValue(dark, "--color-code-success"),
  codeError: tokenValue(dark, "--color-code-error"),
};

const TEXT_MINIMUM = 4.5;
const NON_TEXT_MINIMUM = 3;

const textPairs = [
  ["light text-primary on canvas", lightTokens.textPrimary, lightTokens.canvas],
  [
    "light text-primary on surface",
    lightTokens.textPrimary,
    lightTokens.surface,
  ],
  [
    "light text-primary on surface-raised",
    lightTokens.textPrimary,
    lightTokens.surfaceRaised,
  ],
  [
    "light text-secondary on canvas",
    lightTokens.textSecondary,
    lightTokens.canvas,
  ],
  [
    "light text-secondary on surface",
    lightTokens.textSecondary,
    lightTokens.surface,
  ],
  ["light accent-text on canvas", lightTokens.accentText, lightTokens.canvas],
  ["light accent-text on surface", lightTokens.accentText, lightTokens.surface],
  [
    "light highlight-text on canvas",
    lightTokens.highlightText,
    lightTokens.canvas,
  ],
  [
    "light highlight-text on surface",
    lightTokens.highlightText,
    lightTokens.surface,
  ],
  [
    "light highlight-text on surface-raised",
    lightTokens.highlightText,
    lightTokens.surfaceRaised,
  ],
  [
    "light surface-raised on accent (button text)",
    lightTokens.surfaceRaised,
    lightTokens.accent,
  ],
  ["light success on canvas", lightTokens.success, lightTokens.canvas],
  ["light warning on canvas", lightTokens.warning, lightTokens.canvas],
  ["light error on canvas", lightTokens.error, lightTokens.canvas],
  ["light code-text on code-bg", lightTokens.codeText, lightTokens.codeBg],
  ["light code-muted on code-bar", lightTokens.codeMuted, lightTokens.codeBar],
  [
    "light code-success on code-bg",
    lightTokens.codeSuccess,
    lightTokens.codeBg,
  ],
  ["light code-error on code-bg", lightTokens.codeError, lightTokens.codeBg],
  ["dark text-primary on canvas", darkTokens.textPrimary, darkTokens.canvas],
  ["dark text-primary on surface", darkTokens.textPrimary, darkTokens.surface],
  [
    "dark text-primary on surface-raised",
    darkTokens.textPrimary,
    darkTokens.surfaceRaised,
  ],
  [
    "dark text-secondary on canvas",
    darkTokens.textSecondary,
    darkTokens.canvas,
  ],
  ["dark accent-text on canvas", darkTokens.accentText, darkTokens.canvas],
  ["dark accent-text on surface", darkTokens.accentText, darkTokens.surface],
  [
    "dark highlight-text on canvas",
    darkTokens.highlightText,
    darkTokens.canvas,
  ],
  [
    "dark highlight-text on surface",
    darkTokens.highlightText,
    darkTokens.surface,
  ],
  [
    "dark highlight-text on surface-raised",
    darkTokens.highlightText,
    darkTokens.surfaceRaised,
  ],
  [
    "dark surface on accent (button text)",
    darkTokens.surface,
    darkTokens.accent,
  ],
  ["dark success on canvas", darkTokens.success, darkTokens.canvas],
  ["dark warning on canvas", darkTokens.warning, darkTokens.canvas],
  ["dark error on canvas", darkTokens.error, darkTokens.canvas],
  ["dark code-text on code-bg", darkTokens.codeText, darkTokens.codeBg],
  ["dark code-muted on code-bar", darkTokens.codeMuted, darkTokens.codeBar],
  ["dark code-success on code-bg", darkTokens.codeSuccess, darkTokens.codeBg],
  ["dark code-error on code-bg", darkTokens.codeError, darkTokens.codeBg],
];

const nonTextPairs = [
  ["light focus-ring on canvas", lightTokens.focusRing, lightTokens.canvas],
  ["light focus-ring on surface", lightTokens.focusRing, lightTokens.surface],
  [
    "light white on accent (buttons)",
    "#ffffff",
    tokenValue(light, "--color-accent"),
  ],
  ["light highlight on canvas", lightTokens.highlight, lightTokens.canvas],
  ["light code-border on code-bg", lightTokens.codeBorder, lightTokens.codeBg],
  ["dark focus-ring on canvas", darkTokens.focusRing, darkTokens.canvas],
  ["dark focus-ring on surface", darkTokens.focusRing, darkTokens.surface],
  ["dark highlight on canvas", darkTokens.highlight, darkTokens.canvas],
  ["dark code-border on code-bg", darkTokens.codeBorder, darkTokens.codeBg],
];

test("dark theme and dark media fallback define identical token values", () => {
  for (const name of Object.keys(darkTokens)) {
    const key = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    assert.equal(
      darkFallback
        .match(new RegExp(`${key}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
        ?.toLowerCase(),
      darkTokens[name],
      `media fallback ${key} must match [data-theme="dark"] ${key}`,
    );
  }
});

test("all text foreground/background pairs meet WCAG AA 4.5:1", () => {
  for (const [label, foreground, background] of textPairs) {
    const ratio = contrastRatio(foreground, background);
    assert.ok(
      ratio >= TEXT_MINIMUM,
      `${label}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, expected >= ${TEXT_MINIMUM}:1`,
    );
  }
});

test("focus rings and accent buttons meet WCAG AA 3:1 non-text", () => {
  for (const [label, foreground, background] of nonTextPairs) {
    const ratio = contrastRatio(foreground, background);
    assert.ok(
      ratio >= NON_TEXT_MINIMUM,
      `${label}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, expected >= ${NON_TEXT_MINIMUM}:1`,
    );
  }
});
