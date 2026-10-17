import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const contentDir = join(repoRoot, "src", "content", "articles");
const astroBin = join(repoRoot, "node_modules", ".bin", "astro");

function writeFixture(name, frontmatter) {
  const path = join(contentDir, name);
  writeFileSync(
    path,
    `---\n${frontmatter.trim()}\n---\n\nFixture body for validation tests.\n`,
  );
  return path;
}

function runSync() {
  assert.ok(
    existsSync(astroBin),
    "astro binary must exist - run `npm ci` first",
  );
  const result = spawnSync(astroBin, ["sync"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60_000,
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function withInvalidFixture(name, frontmatter, assertion) {
  const path = writeFixture(name, frontmatter);
  try {
    assertion(runSync());
  } finally {
    rmSync(path, { force: true });
  }
}

test("invalid base metadata and unknown topics fail content validation", () => {
  withInvalidFixture(
    "zz-validation-fixture-base.md",
    `
title: ""
slug: "NOT VALID SLUG"
description: "too short"
status: published
topics:
  - made-up-topic
`,
    ({ status, output }) => {
      assert.equal(status, 1, "astro sync must fail for invalid metadata");
      assert.match(output, /zz-validation-fixture-base\.md/);
      assert.match(output, /title/);
      assert.match(output, /slug must be lowercase and URL-safe/);
      assert.match(output, /Too small/);
      assert.match(output, /Invalid option/);
    },
  );
});

test("drafts declaring dates fail content validation", () => {
  withInvalidFixture(
    "zz-validation-fixture-draft-dates.md",
    `
title: "Draft with dates"
slug: "zz-validation-fixture-draft-dates"
description: "A draft fixture that illegally declares publication and update dates."
status: draft
publishedAt: 2026-01-01
updatedAt: 2026-02-01
topics:
  - systems-tooling
`,
    ({ status, output }) => {
      assert.equal(status, 1, "astro sync must fail for dated drafts");
      assert.match(output, /drafts must not declare publishedAt/);
      assert.match(output, /drafts must not declare updatedAt/);
    },
  );
});

test("published articles without a publication date fail validation", () => {
  withInvalidFixture(
    "zz-validation-fixture-undated.md",
    `
title: "Published without a date"
slug: "zz-validation-fixture-undated"
description: "A published-status fixture that illegally omits its publication date."
status: published
topics:
  - systems-tooling
`,
    ({ status, output }) => {
      assert.equal(
        status,
        1,
        "astro sync must fail for undated published articles",
      );
      assert.match(output, /published articles require a publishedAt date/);
    },
  );
});

test("unknown articleType values fail content validation", () => {
  withInvalidFixture(
    "zz-validation-fixture-bad-type.md",
    `
title: "Bad article type"
slug: "zz-validation-fixture-bad-type"
description: "A fixture declaring an article type outside the approved set."
status: published
publishedAt: 2026-01-01
topics:
  - systems-tooling
articleType: diary
`,
    ({ status, output }) => {
      assert.equal(
        status,
        1,
        "astro sync must fail for an unapproved articleType",
      );
      assert.match(output, /Invalid enum option|Invalid option/);
    },
  );
});

test("future updatedAt timestamps fail content validation", () => {
  withInvalidFixture(
    "zz-validation-fixture-future-update.md",
    `
title: "Future update timestamp"
slug: "zz-validation-fixture-future-update"
description: "A published fixture whose update timestamp lies impossibly in the future."
status: published
publishedAt: 2020-01-01
updatedAt: 2099-01-01
topics:
  - systems-tooling
`,
    ({ status, output }) => {
      assert.equal(
        status,
        1,
        "astro sync must fail for future updatedAt values",
      );
      assert.match(output, /updatedAt must not be in the future/);
    },
  );
});

test("valid content still syncs cleanly after fixture runs", () => {
  const { status, output } = runSync();
  assert.equal(
    status,
    0,
    `astro sync must pass with only committed content present, got: ${output}`,
  );
});
