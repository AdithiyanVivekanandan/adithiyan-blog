# ADR 0001: Technology stack and content workflow

Status: Accepted · 15 October 2026

## Context

The blog specifications (docs/04, docs/01, docs/05) require a static-first personal technical publication with minimal attack surface, no database or authentication, validated content metadata, TypeScript, and low operational overhead. The specifications recommend Astro with Markdown/MDX content collections and a choice between Cloudflare Pages and Vercel for managed hosting. The owner chose Vercel. GitHub (private remote) is the intended source-control host so the Session 2 CI workflow (GitHub Actions) can run checks and protect the production branch.

## Decision

- Framework: Astro, static output (`output: "static"`), client-side JavaScript only when it provides real value.
- Language: TypeScript with strict checking (`astro/tsconfigs/strict`).
- Content workflow: Markdown/MDX in Git via Astro content collections, with frontmatter schema validation at build time. Drafts are excluded from every public output. No CMS at launch; a Git-based or headless CMS is a future decision requiring its own ADR and threat-model review.
- Hosting: Vercel, connected to a private GitHub repository, deploying the static build output. Preview deployments must not expose unpublished content; production deploys come only from the protected default branch.
- Package manager: npm with a committed lockfile and repeatable installs (`npm ci` in CI).
- Source control: local Git repository now; push to a private GitHub remote before Session 2 CI work. Default branch protected; production deploys restricted.

## Alternatives considered

- Cloudflare Pages: equally viable managed static hosting; rejected only because the owner selected Vercel. Revisit if Vercel plan limits or DNS arrangement make it a poor fit.
- Next.js: viable but application-oriented; adds complexity the specs explicitly avoid for a content-first static publication.
- Git-based/headless CMS at launch: deferred; Markdown-in-Git is the specs' best default for security and simplicity.
- Custom admin or database: rejected per specs 01/05 (auth, CSRF, XSS, uploads, audit burden).

## Consequences

- Static HTML output keeps the attack surface small and performance targets achievable; no server runtime to patch.
- Build-time schema validation fails the build on invalid metadata, preventing malformed posts from shipping.
- Vercel preview deployments are a trust boundary: private-repo previews must be access-controlled until launch review confirms otherwise.
- The working publication name is a placeholder and must live in one configurable location, never hard-coded across templates.
- Introducing a CMS, comments, accounts, uploads, analytics, or a database invalidates parts of this ADR and requires a new decision record plus threat-model review before implementation.
