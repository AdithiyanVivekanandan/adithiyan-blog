# Technical Fieldnotes — personal technical blog

A static, content-first technical publication built with Astro. Working name; the final name is configurable in `src/consts.ts` and is not baked into assets.

Specifications live in [`docs/`](docs/) (read `docs/README.txt` for order). Architecture decisions live in [`docs/adr/`](docs/adr/).

## Stack

- **Astro** (static output), TypeScript strict
- **Markdown/MDX** content via Astro content collections (schema-validated at build)
- **Cloudflare Pages** static hosting from a private GitHub remote (see [ADR 0002](docs/adr/0002-hosting-on-cloudflare-pages.md))
- **npm** with committed lockfile

See [ADR 0001](docs/adr/0001-technology-stack-and-content-workflow.md).

## Commands

```sh
npm ci                # repeatable install from lockfile
npm run dev           # local development server
npm run build         # production build to dist/
npm run preview       # serve the production build locally

# quality gates (all are also run by CI)
npm run format        # format the repository with Prettier (write)
npm run format:check  # verify formatting without writing
npm run lint          # ESLint (JS, TypeScript, Astro templates)
npm run typecheck     # astro check (Astro + TypeScript diagnostics)
npm run lint:secrets  # secretlint scan of tracked-style content (values masked in output)
npm run audit:deps    # npm audit, fails on high or critical advisories
npm test              # node:test suite (requires `npm run build` first)

npm run check         # the full release gate: format:check, lint, typecheck,
                      # lint:secrets, audit:deps, build, test — in that order
```

## Quality gates

The exact checks required for a release are exactly `npm run check`:

1. `format:check` — Prettier (`prettier-plugin-astro` for `.astro`)
2. `lint` — ESLint flat config: `@eslint/js` recommended, `typescript-eslint` recommended, `eslint-plugin-astro` recommended
3. `typecheck` — `astro check` against the strict Astro TypeScript config
4. `lint:secrets` — secretlint with the recommended preset plus AWS Access Key ID scanning (`enableIDScanRule`)
5. `audit:deps` — `npm audit --audit-level=high` (0 high/critical advisories required)
6. `build` — static production build to `dist/`
7. `test` — `node --test` suite in `tests/`

### CI behavior (`.github/workflows/ci.yml`)

- Runs on every **pull request** and on **pushes to `main`**; never deploys and never references secrets, so forked pull requests are safe to run with the default read-only token.
- Top-level `permissions: contents: read`; `actions/checkout` uses `persist-credentials: false` so no token remains in the workspace.
- Actions are pinned to full commit SHAs (with a version comment for review); Dependabot (`github-actions` ecosystem) proposes SHA bumps weekly.
- `npm ci` enforces the lockfile; a concurrency group cancels superseded runs on pull requests but never cancels an in-progress `main` run.
- Build runs before tests, because build-output tests read `dist/`.

### Secret scanning notes

- secretlint output **masks detected values by default** (v13); findings show rule id, file, line and masked text only.
- The recommended preset covers AWS, GitHub, GitLab, npm, Slack, Stripe, private keys (PEM with base64 magic-byte validation), database connection strings and more. AWS Access Key **IDs** require the opt-in `enableIDScanRule` option, enabled in `.secretlintrc.json`.
- Limitations: pattern-based scanning cannot detect arbitrary high-entropy strings or secrets in binaries; `.secretlintignore` excludes `node_modules/`, `dist/`, `.astro/` and `*.docx`. It is not a substitute for GitHub secret scanning push protection (enable it in repository settings).
- False positives: never delete or weaken a rule to silence a finding. Add the smallest scoped allowlist (rule `options.allows`) or move the value into a `.env`-style ignored file, and document the reason in the pull request.

### Dependency vulnerability checks

- `npm run audit:deps` fails on high/critical advisories; it only covers the npm registry advisory database.
- Dependabot version updates and alerts are configured via `.github/dependabot.yml` (npm + github-actions, weekly). Enable **Dependabot alerts** and **secret scanning + push protection** in GitHub repository settings once the private remote exists (availability depends on your GitHub plan).
- Resolution path: review the advisory, upgrade to a fixed version (`npm update <pkg>`), re-run `npm run check`. Use `npm audit fix` only after reviewing the resulting diff; never `--force`.

## Private publishing desk

The site includes a private CMS at `/r1phun73r/` for editing Markdown through a
GitHub App. It is documented in [`docs/cms.md`](docs/cms.md) and
[ADR 0003](docs/adr/0003-private-publishing-cms.md).

Before it can save drafts:

1. Make the GitHub repository private.
2. Protect `/r1phun73r/*` with Cloudflare Access and allowlist the editor's
   email.
3. Create a GitHub App with Contents read/write on this repository only.
4. Configure the production environment variables listed in `docs/cms.md`.
5. Set `CMS_REPO_PRIVATE_CONFIRMED=true` only after the repository is private.

Drafts live under `drafts/`, outside the Astro content collection. Publishing
commits to `src/content/articles/` and lets Cloudflare Pages rebuild. The CMS
never deploys directly and never claims a commit is live without deployment
evidence.

Local API development uses Pages Functions:

```sh
cp .dev.vars.example .dev.vars
npm run build
npx wrangler pages dev dist
```

## Configuration before launch

- The site URL is configured for production (`https://blog.adithiyan.me` in `astro.config.mjs`). Canonical URLs, RSS, sitemap and the search index are derived from it.
- Update the publication name/description in `src/consts.ts` if the working name changes.
- Connect the Cloudflare Pages project to the GitHub repository, choose and protect the production branch (require the `CI / Quality gates` check, restrict force-pushes), configure the CMS variables and verify headers/DNS (see `docs/cms.md`, `docs/runbook.md` and `docs/05_security_threat_model_and_hardening.docx`).
- Keep the repository private. `drafts/` is deliberately outside `src/content/`, but a public repository would still expose draft text.

Then in GitHub settings: enable branch protection, secret scanning/push
protection and Dependabot alerts. Never commit secrets; `.env*` and
`.dev.vars*` are gitignored.

## Session status

Session 1 complete: repository, docs, ADR, minimal app, clean production build.
Session 2 complete: quality gates (format, lint, typecheck, tests, secret scan, dependency audit) plus CI workflow and Dependabot config.
Session 3 complete: design tokens, base layout, navigation and theme system.
Session 4 complete: content collection schema, draft-exclusion policy, article pipeline and one end-to-end article.
Session 5 and 6 complete: home, index, topics, archive, About, 404, RSS, sitemap, robots, mobile navigation and design-fidelity fixes.
Launch staging complete: surveyed-territory homepage, SECURITY.md, production site URL, local search, colophon and populated-article template tests.
Private CMS complete: Access/GitHub App boundary, private draft paths, media handling, sanitised preview, deployment status, admin headers and tests.

Remaining before launch is host-side and manual: make the repository private, connect Cloudflare Pages and DNS, configure Access and the GitHub App, verify live headers/CSP, smoke-test the admin desk with real credentials, and run a manual accessibility/reader pass (see `docs/cms.md`, `docs/runbook.md` and `docs/06_qa_launch_and_operations_runbook.docx`).
