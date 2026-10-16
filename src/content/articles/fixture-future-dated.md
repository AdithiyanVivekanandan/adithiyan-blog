---
title: "Scheduled publication fixture"
slug: "fixture-future-dated"
description: "An unpublished scheduled fixture used to prove that future-dated articles are excluded from every public route, listing, metadata and feed until a build runs after their publication date."
publishedAt: 2099-06-01
status: published
topics:
  - systems-tooling
articleType: fieldnote
---

This file is a test fixture, not an article. It declares `status: published` with a far-future `publishedAt` date so automated tests can prove that scheduled content never reaches public output before its date. The body carries a marker string, `future-canary-5b8d31`, which tests search for across the entire production build. A rebuild after 1 June 2099 would publish it; until then it must appear nowhere in `dist/`.
