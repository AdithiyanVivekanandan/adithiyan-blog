---
title: "Unpublished draft fixture"
slug: "draft-fixture-leaked-token"
description: "An unpublished fixture draft used to prove that draft content never reaches public routes, listings, metadata or feeds."
status: draft
topics:
  - security-research
articleType: fieldnote
---

This file is a test fixture, not an article. It exists in the repository so automated tests can prove that content with `status: draft` is excluded from every public output.

The body carries a marker string, `draft-canary-7f2e91`, which tests search for across the entire production build. If that marker — or this title, or this description — ever appears in `dist/`, the build is leaking unpublished content and the test suite must fail.

It deliberately declares no `publishedAt` date: draft dates must not leak either.
