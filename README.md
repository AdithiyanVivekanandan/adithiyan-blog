# Technical Fieldnotes — personal technical blog

A static, content-first technical publication built with Astro. Working name; the final name is configurable in `src/consts.ts` and is not baked into assets.

Specifications live in [`docs/`](docs/) (read `docs/README.txt` for order). Architecture decisions live in [`docs/adr/`](docs/adr/).

## Stack

- **Astro** (static output), TypeScript strict
- **Markdown/MDX** content via Astro content collections (added in a later session; schema-validated at build)
- **Vercel** static hosting from a private GitHub remote
- **npm** with committed lockfile

See [ADR 0001](docs/adr/0001-technology-stack-and-content-workflow.md).

## Commands

```sh
npm ci          # repeatable install from lockfile
npm run dev     # local dev server
npm run build   # production build to dist/
npm run preview # serve the production build locally
```

## Configuration before launch

- Set the real site URL in `astro.config.mjs` (`site`) — currently a placeholder. Canonical URLs, RSS and sitemap depend on it.
- Update the publication name/description in `src/consts.ts`.
- Connect the private GitHub remote and Vercel project; protect the default branch and restrict production deploys (see `docs/04_engineering_architecture_and_publishing.docx`).

## Pushing to a private GitHub remote

The repository is local-only until a remote is added. When ready (Session 2 CI needs it):

```sh
# create an empty private repo on GitHub (no README/.gitignore), then:
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

Then in GitHub settings: enable branch protection on `main` (require CI checks, restrict force-pushes) and enable secret scanning/dependency alerts. Never commit secrets; `.env*` is gitignored.

## Session status

Session 1 complete: repository, docs, ADR, minimal app, clean production build. Sessions 2–3 (quality gates, design system, first article) follow per the project checklist.
