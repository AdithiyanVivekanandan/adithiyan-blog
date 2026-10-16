---
title: "Building a repeatable release check with npm scripts and node:test"
slug: "repeatable-release-check-npm-node-test"
description: "How to chain formatting, linting, type checks, secret scanning, dependency auditing, a production build and tests behind one npm script — and how to prove the chain fails when it should."
publishedAt: 2026-10-12
status: published
topics:
  - systems-tooling
articleType: tutorial
technicalContext: "Verified on Node.js 24.21 and npm 12.2 (Linux) in October 2026. The commands assume npm 9 or newer; if you are on an older release, check the linked npm documentation for flag changes."
limitations: "npm audit only reports advisories from the npm registry database. It will not find vulnerabilities in code you write yourself, and it does not replace reviewing what a dependency actually does. This gate assumes a static build; projects with runtime services need additional checks. Test-runner discovery patterns change between Node releases — confirm them against the Node documentation linked below."
references:
  - title: "npm ci"
    url: "https://docs.npmjs.com/cli/commands/npm-ci"
    annotation: "Installs exactly what the lockfile describes and fails when it disagrees with package.json."
  - title: "npm run-script"
    url: "https://docs.npmjs.com/cli/commands/npm-run-script"
  - title: "npm audit"
    url: "https://docs.npmjs.com/cli/commands/npm-audit"
    annotation: "Registry advisories only; useful as one gate among several, not as a full security review."
  - title: "Test runners (node:test)"
    url: "https://nodejs.org/api/test.html"
---

## The problem: checks that only run when you remember

A small project usually has the right checks — a formatter, a linter, a type checker, a build — but no dependable moment when all of them run. Publishing then depends on memory, and the first time you skip the steps is usually the first time something breaks.

The question this article answers is narrow: **how do you make one command that runs every check, fails loudly when any check fails, and works the same way on your machine and in continuous integration?**

The intended reader maintains a small static site or library with an npm `package.json` and wants a release check they can trust. Everything below was verified on Node.js 24.21 and npm 12.2.

## Start from a clean install

A repeatable gate starts before the checks: the install itself must be deterministic. `npm install` updates the lockfile when `package.json` allows it, so two machines can end up with different trees. `npm ci` does the opposite — it installs exactly what the lockfile records and exits with a non-zero status when `package.json` and the lockfile disagree.

```bash
# reproducible install: fails if the lockfile is stale
npm ci
```

That failure is a feature. If the lockfile is out of date, you want the gate to stop before any check runs, not to quietly install a different dependency tree first.

## Chain the checks behind one script

Each check already has a command, so the gate is a chain. In `package.json`:

```json
{
  "scripts": {
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "astro check",
    "lint:secrets": "secretlint \"**/*\"",
    "audit:deps": "npm audit --audit-level=high",
    "build": "astro build",
    "test": "node --test \"tests/**/*.test.mjs\"",
    "check": "npm run format:check && npm run lint && npm run typecheck && npm run lint:secrets && npm run audit:deps && npm run build && npm test"
  }
}
```

<figure class="pipeline">
 <figcaption>
  The release gate runs seven stages in order: formatting, linting, type
  checking, secret scanning, dependency auditing, the production build and
  tests. Each command must exit successfully before the next runs, and the
  chain stops at the first failure.
</figcaption>
  <ol class="pipeline__stages">
    <li><a href="#chain-the-checks-behind-one-script">format:check</a></li>
    <li><a href="#chain-the-checks-behind-one-script">lint</a></li>
    <li><a href="#chain-the-checks-behind-one-script">typecheck</a></li>
    <li><a href="#chain-the-checks-behind-one-script">lint:secrets</a></li>
    <li><a href="#chain-the-checks-behind-one-script">audit:deps</a></li>
    <li><a href="#prove-the-gate-can-fail">build</a></li>
    <li><a href="#prove-the-gate-can-fail">test</a></li>
  </ol>
</figure>

`&&` is the whole trick: each command must exit `0` before the next one runs, and the chain stops at the first failure, propagating a non-zero exit status to the caller. CI systems and shell scripts treat that status as pass or fail, so the same command behaves identically locally and in CI.

Two details worth keeping:

- Keep the individual commands runnable on their own. When `npm run lint` fails inside the chain, you re-run it directly to iterate — the gate composes small commands, it does not replace them.
- Keep the chain ordered from cheapest to most expensive. Formatting and linting finish in seconds; builds and tests take longer, and failing early avoids paying for a build you were going to throw away.

## Prove the gate can fail

A gate you have never seen fail is a gate you cannot trust. Node ships a test runner, so no test framework is required to write one real check. This example asserts that the production build actually exists — the kind of check that catches "the build step was skipped or wrote to the wrong directory":

```js
// tests/build-output.test.mjs
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

test("production build exists", () => {
  assert.ok(
    existsSync("dist/index.html"),
    "dist/index.html not found — run `npm run build` first",
  );
});
```

Run it directly to see both outcomes:

```bash
node --test "tests/**/*.test.mjs"
```

Delete `dist/` and run it again: the test fails, the message explains why, and the process exits `1`. Then run `npm run check` with the same directory missing and watch the chain stop at the build step. Seeing both paths — pass and fail — is what turns a script into a gate.

> A check nobody runs is not a check. The value of the gate is that there is exactly one command people are willing to run.

## What the gate does not catch

The chain is mechanical: it verifies the code it is pointed at, on the machine that runs it. It does not verify dependency intent — `npm audit` only reports advisories from the npm registry — and it does not prove anything about accessibility, performance or behaviour on a real device. Those still need separate, deliberate checks. Treat the gate as the floor for every publish, not as the ceiling.
