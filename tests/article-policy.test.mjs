import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertUniqueSlugs,
  compareArticles,
  filterByTopic,
  getAdjacentArticles,
  getRelatedArticles,
  groupArticlesByYear,
  isLiveArticle,
} from "../src/lib/article-policy.ts";

function article(id, overrides = {}) {
  return {
    id,
    data: {
      title: `Title ${id}`,
      slug: id,
      status: "published",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      topics: ["systems-tooling"],
      ...overrides,
    },
  };
}

test("isLiveArticle requires a published status with a past-or-now date", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  assert.equal(
    isLiveArticle(
      article("published", { publishedAt: new Date("2026-06-01T00:00:00Z") }),
      now,
    ),
    true,
  );
  assert.equal(
    isLiveArticle(
      article("draft", {
        status: "draft",
        publishedAt: new Date("2026-06-01T00:00:00Z"),
      }),
      now,
    ),
    false,
  );
  assert.equal(
    isLiveArticle(
      article("future", { publishedAt: new Date("2026-06-16T00:00:00Z") }),
      now,
    ),
    false,
  );
  assert.equal(
    isLiveArticle(article("undated", { publishedAt: undefined }), now),
    false,
  );
});

test("isLiveArticle treats an exact-now timestamp as live", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  assert.equal(
    isLiveArticle(article("exact", { publishedAt: now }), now),
    true,
  );
  assert.equal(
    isLiveArticle(
      article("one-ms-later", {
        publishedAt: new Date(now.getTime() + 1),
      }),
      now,
    ),
    false,
  );
});

test("assertUniqueSlugs throws a clear error naming the slug and entries", () => {
  const entries = [
    article("one.md", { slug: "shared-slug" }),
    article("two.md", { slug: "shared-slug" }),
    article("three.md", { slug: "unique-slug" }),
  ];
  assert.throws(
    () => assertUniqueSlugs(entries),
    (error) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('"shared-slug"'));
      assert.ok(error.message.includes("one.md"));
      assert.ok(error.message.includes("two.md"));
      assert.ok(!error.message.includes("three.md"));
      return true;
    },
  );
});

test("assertUniqueSlugs accepts a collection with unique slugs", () => {
  assertUniqueSlugs([
    article("one.md"),
    article("two.md"),
    article("three.md", { slug: "draft-style" }),
  ]);
});

test("compareArticles orders newest first and breaks date ties by slug", () => {
  const older = article("older", {
    publishedAt: new Date("2026-01-01T00:00:00Z"),
  });
  const newer = article("newer", {
    publishedAt: new Date("2026-03-01T00:00:00Z"),
  });
  const tieB = article("tie-b", {
    publishedAt: new Date("2026-02-01T00:00:00Z"),
  });
  const tieA = article("tie-a", {
    publishedAt: new Date("2026-02-01T00:00:00Z"),
  });
  const undated = article("undated", { publishedAt: undefined });

  const forward = [older, newer, tieB, tieA, undated]
    .slice()
    .sort(compareArticles);
  const shuffled = [tieA, undated, older, tieB, newer]
    .slice()
    .sort(compareArticles);

  const expected = ["newer", "tie-a", "tie-b", "older", "undated"];
  assert.deepEqual(
    forward.map((entry) => entry.data.slug),
    expected,
  );
  assert.deepEqual(
    shuffled.map((entry) => entry.data.slug),
    expected,
    "ordering must not depend on input order",
  );
});

test("getAdjacentArticles walks the published order with correct boundaries", () => {
  const newer = article("newer");
  const current = article("current");
  const older = article("older");
  const ordered = [newer, current, older];

  const middle = getAdjacentArticles(current, ordered);
  assert.equal(middle.previous?.data.slug, "newer");
  assert.equal(middle.next?.data.slug, "older");

  const head = getAdjacentArticles(newer, ordered);
  assert.equal(head.previous, null);
  assert.equal(head.next?.data.slug, "current");

  const tail = getAdjacentArticles(older, ordered);
  assert.equal(tail.previous?.data.slug, "current");
  assert.equal(tail.next, null);

  const solo = getAdjacentArticles(current, [current]);
  assert.deepEqual(solo, { previous: null, next: null });

  const missing = getAdjacentArticles(article("ghost"), ordered);
  assert.deepEqual(missing, { previous: null, next: null });
});

test("getRelatedArticles shares topics, excludes self and respects the limit", () => {
  const entry = article("entry", {
    publishedAt: new Date("2026-05-01T00:00:00Z"),
    topics: ["systems-tooling", "security-research"],
  });
  const relatedOne = article("related-one", {
    publishedAt: new Date("2026-04-01T00:00:00Z"),
    topics: ["systems-tooling"],
  });
  const relatedTwo = article("related-two", {
    publishedAt: new Date("2026-03-01T00:00:00Z"),
    topics: ["security-research"],
  });
  const relatedThree = article("related-three", {
    publishedAt: new Date("2026-02-01T00:00:00Z"),
    topics: ["systems-tooling"],
  });
  const unrelated = article("unrelated", {
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    topics: ["experiments-fieldnotes"],
  });

  const ordered = [entry, relatedOne, relatedTwo, relatedThree, unrelated];
  const related = getRelatedArticles(entry, ordered);
  assert.deepEqual(
    related.map((item) => item.data.slug),
    ["related-one", "related-two"],
  );
  assert.deepEqual(
    getRelatedArticles(entry, ordered, 1).map((item) => item.data.slug),
    ["related-one"],
  );
  assert.deepEqual(getRelatedArticles(entry, [entry, unrelated]), []);
});

test("filterByTopic returns only articles carrying the topic", () => {
  const a = article("a", { topics: ["systems-tooling"] });
  const b = article("b", { topics: ["security-research"] });
  const c = article("c", { topics: ["security-research", "systems-tooling"] });
  assert.deepEqual(
    filterByTopic([a, b, c], "systems-tooling").map((item) => item.data.slug),
    ["a", "c"],
  );
  assert.deepEqual(filterByTopic([a, b, c], "ai-engineering"), []);
});

test("groupArticlesByYear groups by UTC year, newest year first", () => {
  const a = article("a", { publishedAt: new Date("2026-03-01T00:00:00Z") });
  const b = article("b", { publishedAt: new Date("2025-12-31T23:59:59Z") });
  const c = article("c", { publishedAt: new Date("2026-01-15T00:00:00Z") });
  const undated = article("undated", { publishedAt: undefined });

  const groups = groupArticlesByYear([a, b, c, undated]);
  assert.deepEqual(
    groups.map((group) => group.year),
    [2026, 2025],
    "years must be newest first and undated entries skipped",
  );
  assert.deepEqual(
    groups[0].articles.map((entry) => entry.data.slug),
    ["a", "c"],
    "within-year order must follow the input (already deterministic)",
  );
  assert.deepEqual(
    groups[1].articles.map((entry) => entry.data.slug),
    ["b"],
  );
});

test("groupArticlesByYear returns no groups for an empty archive", () => {
  assert.deepEqual(groupArticlesByYear([]), []);
});

test("year grouping combined with live filtering excludes future articles", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const live = article("live", {
    publishedAt: new Date("2026-01-01T00:00:00Z"),
  });
  const future = article("future", {
    publishedAt: new Date("2099-06-01T00:00:00Z"),
  });
  const draft = article("draft", {
    status: "draft",
    publishedAt: new Date("2026-02-01T00:00:00Z"),
  });
  const visible = [live, future, draft].filter((entry) =>
    isLiveArticle(entry, now),
  );
  const groups = groupArticlesByYear(visible);
  assert.deepEqual(
    groups.map((group) => group.year),
    [2026],
  );
  assert.deepEqual(
    groups[0].articles.map((entry) => entry.data.slug),
    ["live"],
  );
});
