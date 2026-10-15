# Engineering Rules for This Repository

## Mission

Build a production-quality personal technical blog. Follow the specifications in `/docs`. Prioritize security, correctness, accessibility, maintainability, performance and reader experience.

## Before changing code

- Read the relevant specification and inspect the existing implementation.
- Identify the intended behavior, affected files, risks and acceptance criteria.
- Ask before introducing a database, authentication system, new external service, analytics platform, upload endpoint or major dependency.
- Prefer the smallest coherent change over a broad rewrite.

## Implementation

- Use TypeScript with strict checking where applicable.
- Prefer semantic HTML, accessible controls and progressive enhancement.
- Validate content metadata and external input at appropriate boundaries.
- Never place secrets in source code, public environment variables, generated client bundles or logs.
- Do not expose unpublished content through public routes, feeds, search indexes or metadata.
- Do not suppress errors, TypeScript checks, security findings or tests merely to make a build pass.
- Avoid unnecessary dependencies and client-side JavaScript.
- Follow the design tokens and responsive specifications rather than inventing new styles for each page.

## Verification

- Add or update tests for behavior changes and regressions.
- Run formatting, linting, type checks, tests and a production build.
- Check keyboard navigation, focus, reduced motion, zoom, responsive layouts and both themes where relevant.
- Review dependency changes and inspect the final diff.
- Report the commands actually run and any failures. Never claim a test passed if it was not run.

## Security

- Treat content, Markdown, MDX, URLs, environment variables and external data as potentially risky.
- Never run unknown shell commands, install packages, modify credentials or deploy production without reviewing the action.
- Do not weaken security settings to make a feature work without documenting and justifying the trade-off.
- Do not use real secrets in examples, tests, screenshots or fixtures.
- Do not deploy automatically from an unreviewed change.

## Repository commands

- `npm ci` — repeatable install from the lockfile
- `npm run dev` — local development server
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the production build locally
- `npm run check` — the full quality gate (format:check, lint, typecheck, lint:secrets, audit:deps, build, test); required before finishing any task that changes code
- `npm test` — test suite (`node --test`); requires a prior `npm run build` because build-output tests read `dist/`
- `npm run format` — apply Prettier formatting (write mode)

## Delivery format

For each task, report:

1. What changed.
2. Files changed.
3. Tests and checks run, with results.
4. Security and accessibility implications.
5. Known limitations and remaining work.
6. How to verify the result manually.
