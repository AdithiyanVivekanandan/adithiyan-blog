# ADR 0003: Private publishing CMS on Cloudflare Pages

- Status: Accepted
- Date: 2026-10-27
- Supersedes: none. Extends ADR 0002 (Cloudflare Pages hosting).

## Context

The publication needs an editing desk that can save unpublished work without
putting it in the public build. The public site must remain static, fast and
readable without client-side JavaScript.

Requirements driving the decision:

- Drafts must never appear in `dist/`, feeds, sitemap, search or metadata.
- Only one authorised editor needs access.
- No database or upload service should be introduced.
- Writing should stay in Git so history, review and rollback remain available.
- The public site must not depend on the CMS at request time.

## Decision

1. **Private repository.** The GitHub repository must be private before drafts
   are enabled. Drafts are committed under `drafts/`, a path outside the Astro
   content collection. `CMS_REPO_PRIVATE_CONFIRMED=true` is a second explicit
   gate: draft writes return `503 not_configured` until the owner confirms the
   repository privacy change.
2. **Cloudflare Access.** `/r1phun73r/*` is protected by a Cloudflare Access
   application. Pages Functions verify the Access JWT issuer, audience, expiry
   and email allowlist on every API request. A localhost-only development
   bypass is available off production.
3. **GitHub App.** The CMS uses a GitHub App with Contents read/write access to
   this repository only. Commits use the Git Data API, validate every path
   against an allowlist (_not_ `.gitignore`), and use expected blob SHAs to
   detect concurrent edits.
4. **Filesystem layout.**
   - Published article: `src/content/articles/<slug>.md`
   - Draft: `drafts/<slug>.md`
   - Archive: `drafts/archive/<slug>.md`
   - Draft media: `drafts/media/<slug>/`
   - Published media: `public/images/<slug>/`
5. **Publishing.** Publishing normalises frontmatter, copies referenced draft
   media into `public/images/<slug>/`, rewrites URLs, writes the published
   article, and removes the draft in the same atomic commit. It does not
   deploy directly; Cloudflare Pages builds the resulting commit.
6. **Deployment status.** The CMS may read Cloudflare Pages deployment status
   with a least-privilege API token. If those credentials are absent, the UI
   reports "deployment status not configured" and never claims a live deploy.
7. **Write protection.** Every mutation requires a same-origin request and an
   HMAC-signed CSRF token bound to the authenticated email with a two-hour
   lifetime. Rate limits apply per identity and operation.
8. **Content safety.** CMS input is validated at the boundary. Raw HTML uses
   an allowlist, active tags/attributes/schemes are rejected, Markdown images
   require alt text and scoped paths, and media is accepted only after raster
   signature, dimension and size checks. Preview sanitisation is a second
   layer, not the source of truth.
9. **Admin surface.** The desk is a static Astro route with self-hosted,
   bundled assets. It receives strict CSP, `noindex`, `no-store` and no public
   site chrome. It stays out of robots, sitemap, feeds and search output.

## Consequences

- Draft privacy depends on the repository actually being private. The code
  gate is a reminder and a fail-safe, not a substitute for the hosting setting.
- The CMS is coupled to GitHub and Cloudflare. Losing provider access requires
  direct Git recovery rather than a separate content database.
- Media is committed to the repository, which is simple and auditable but not
  suitable for large libraries.
- A single editor avoids multi-user conflict resolution. Expected-SHA checks
  still catch stale tabs and external edits.
- Local Pages Functions development needs `wrangler` and a local `.dev.vars`;
  the static site can still be developed with `npm run dev`.

## Alternatives considered

- **Database-backed CMS:** rejected for operational surface, backups, auth and
  cost disproportionate to one author.
- **GitHub web editing only:** rejected because previews, media handling and
  structured validation are weak.
- **Drafts as published `status: draft` files:** rejected because the public
  repository and build pipeline would still contain draft text.
- **Direct deploy from the CMS:** rejected to keep one reviewed Git history and
  one deployment path.
