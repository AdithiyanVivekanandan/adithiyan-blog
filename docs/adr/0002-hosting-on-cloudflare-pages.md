# ADR 0002: Hosting on Cloudflare Pages

Status: Accepted · 17 October 2026

## Context

ADR 0001 chose Astro with static output and deferred the hosting-provider
choice between Cloudflare Pages and Vercel to the owner. At the time it was
written the owner selected Vercel. While staging the launch (production site
URL, domain planning, DNS and security-header ownership), the owner
standardized on Cloudflare Pages: the production domain is managed at
Cloudflare, the static `dist/` output deploys there without any adapter, and
preview deployments come from the same connected Git repository.

## Decision

- Static output `dist/` deploys to Cloudflare Pages as plain static files. No
  Cloudflare adapter, no Wrangler command and no server runtime are added to
  this repository; `astro build` remains the complete production artifact.
- The production URL is `https://blog.adithiyan.me` (set in
  `astro.config.mjs`). Canonical URLs, RSS, sitemap, robots.txt and the search
  index are derived from it at build time.
- HTTP security headers, caching rules, redirects and TLS are configured in
  the Cloudflare Pages dashboard, not in repository code. They must be
  verified live against the production domain per
  `docs/05_security_threat_model_and_hardening.docx`.
- Preview deployments that contain unpublished content are a trust boundary:
  they must be access-controlled in the provider dashboard. An obscured URL is
  not access control.

## Consequences

- The deployment surface stays minimal: the repository holds no
  provider-specific build or deploy tooling.
- Rollback, header changes and DNS management happen in the Cloudflare
  dashboard and are owned by the operator; `docs/runbook.md` records the
  recovery procedures.
- CI (`.github/workflows/ci.yml`) is unaffected: it builds and tests, it
  never deploys.

## Alternatives considered

- Staying on Vercel (ADR 0001 default): viable, but the owner manages DNS and
  the security edge on Cloudflare; splitting hosting and DNS across providers
  would add a second control plane for a single static site.
- Self-hosting: rejected; the attack surface and maintenance burden contradict
  the specs' student-maintained, low-operations requirement.
