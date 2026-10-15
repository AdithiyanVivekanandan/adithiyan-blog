import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

function readLines(relativePath) {
  const raw = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return raw
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line.length > 0);
}

test(".gitignore excludes environment files", () => {
  const lines = readLines("../.gitignore");
  assert.ok(lines.includes(".env"), ".gitignore must exclude .env");
  assert.ok(lines.includes(".env.*"), ".gitignore must exclude .env.*");
  assert.ok(
    lines.includes("!.env.example"),
    ".gitignore must allow committed .env.example files",
  );
});

test(".gitignore excludes build output and dependencies", () => {
  const lines = readLines("../.gitignore");
  for (const entry of ["dist/", "node_modules/", ".astro/"]) {
    assert.ok(lines.includes(entry), `.gitignore must exclude ${entry}`);
  }
});

test("no environment files exist at the repository root", () => {
  const entries = readdirSync(new URL("../", import.meta.url));
  const envFiles = entries.filter(
    (name) => name === ".env" || name.startsWith(".env."),
  );
  assert.deepEqual(
    envFiles,
    [],
    `unexpected environment files at repo root: ${envFiles.join(", ")}`,
  );
});
