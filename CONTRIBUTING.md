# Contributing

This is a personal publication maintained by a small, trusted set of
contributors (currently the owner). External pull requests are not expected;
these rules exist so that any contribution — content or code — keeps the
publication dependable.

## Proposing an article

Articles are Markdown files in `src/content/articles/`. Every article:

- carries frontmatter validated by `src/content.config.ts`
  (title, unique lowercase `slug`, `description`, `status`, topics from the
  approved set in `src/lib/topics.ts`);
- uses `status: draft` with **no dates** while work is in progress — drafts
  are excluded from every public page, feed, index and search result by
  build-time policy;
- becomes publishable by setting `status: published` with a real
  `publishedAt` date (UTC);
- states its technical context, evidence and limitations, and lists primary
  references where relevant (see the editorial standards on the About page
  and `docs/06_qa_launch_and_operations_runbook.docx`).

Never commit secrets, credentials, live configuration, malware samples or
identifying private details in article content, examples or fixtures.

### Evidence conventions inside articles

The publication reads as a field journal: every claim needs a visible epistemic
status, and investigation beats assertion. Inside article bodies use:

- **GFM tables** for comparisons — prefer the "can establish / cannot
  establish" shape so capability is never mistaken for observation. The
  stylesheet renders tables block-level with horizontal scrolling for
  overflow; changing `display` on a `<table>` can drop table semantics in
  some screen readers, and the scroll region is not keyboard-focusable in
  every browser. Keep tables short and narrow (brief first column, few
  rows) so they never need to scroll, and prefer a list when they would.
- **GFM task lists** (`- [ ]`) for pre-publication checklists and step gates.
- **GFM footnotes** (`[^1]`) for provenance of a convention, not new claims.
- **`<kbd>`** for key combinations in build notes.
- **Evidence labels** to mark the mode of knowing, defined once and used
  consistently:
  - `<span class="evidence evidence--fact">fact</span>` — directly observed
    or reproducibly confirmed;
  - `<span class="evidence evidence--inference">inference</span>` —
    interpretation of observations (say from what evidence it is drawn);
  - `<span class="evidence evidence--unknown">unknown</span>` — explicitly
    unresolved.

Never present interpretation as observation, and never invent findings,
screenshots or telemetry. An article that has not done its practical work
stays a draft: `An unpublished draft is the correct state for an
investigation plan` — see the draft-exclusion policy above. Screenshots are
only appropriate from your own controlled environment with content sanitized.

## Code changes

- TypeScript strict checking and the existing Astro architecture stay in
  place; no new dependencies without a documented need and review
  (dependencies change the threat model).
- Client-side JavaScript stays minimal and progressive: every page must
  remain readable with JavaScript disabled.
- Do not weaken, delete or rename tests to make a change pass. If expected
  behavior legitimately changed, update the test and say so in the pull
  request description.

## Before every change

Run the full release gate:

```sh
npm run check
```

which runs formatting, lint, type check, secret scan, dependency audit,
production build and the test suite — the same checks CI runs.

## Security

Report vulnerabilities through the private channel described in
[SECURITY.md](SECURITY.md). Do not open public issues for security findings,
and do not include exploit details or secrets in commits, screenshots or test
fixtures.
