# Private publishing desk

The site stays static. A private admin desk at `/r1phun73r/` edits Markdown in
GitHub through a Small API implemented as Cloudflare Pages Functions.

Read ADR 0003 before changing the auth, storage or publishing model.

## Security model

| Control        | Behaviour                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Network access | Cloudflare Access protects `/r1phun73r/*`                                                                                           |
| Identity       | Access JWT issuer/audience verified; email must be in `CMS_ALLOWED_EMAILS`                                                          |
| Session        | Access controls sign-in, session lifetime and logout; the app sets no session cookie                                                |
| Git access     | GitHub App, Contents read/write, single repository                                                                                  |
| Drafts         | `drafts/` outside the Astro content collection; writes locked until the repository is private and `CMS_REPO_PRIVATE_CONFIRMED=true` |
| Writes         | Same-origin `Origin`, no cross-site `Sec-Fetch-Site`, HMAC CSRF token bound to email                                                |
| Paths          | GitHub writes allowlisted to `src/content/articles/`, `drafts/`, `public/images/`                                                   |
| Concurrency    | Expected blob SHAs on changed files and fast-forward ref updates                                                                    |
| Content        | Frontmatter validation, raw-HTML allowlist, safe URL checks, alt text required                                                      |
| Media          | Raster signature and dimensions, no SVG/HTML, 8 MB/8192 px/40 MP limits                                                             |
| Uploads        | Request body capped while streaming, before multipart parsing                                                                       |
| Admin page     | `noindex`, `no-store`, strict CSP, no public header/footer                                                                          |
| Rate limits    | Best-effort in-memory limits per identity and isolate for writes and uploads; not a global quota                                    |
| Secrets        | Server-only environment variables; never in the client bundle                                                                       |

Deployment status is advisory. A commit can succeed while Pages is still
building. The desk never displays "live" without a matching Pages deployment.

## Repository layout

```text
src/content/articles/<slug>.md   published article (Astro content)
drafts/<slug>.md                 private working draft
drafts/archive/<slug>.md         archived draft
drafts/media/<slug>/<file>       private draft media
public/images/<slug>/<file>      published media
```

Drafts use `cmsUpdatedAt`; archived drafts use `cmsArchivedAt` and
`cmsUpdatedAt`. Those fields are internal. Published articles must not contain
`cmsUpdatedAt` or `cmsArchivedAt`.

## Routes

| Route                                    | Methods           | Purpose                                        |
| ---------------------------------------- | ----------------- | ---------------------------------------------- |
| `/r1phun73r/`                            | GET               | Static admin shell                             |
| `/r1phun73r/api/session`                 | GET               | Identity, CSRF token, topics, types, readiness |
| `/r1phun73r/api/articles`                | GET, POST         | List summaries, save draft or publish          |
| `/r1phun73r/api/articles/:slug`          | GET, PUT, DELETE  | Detail, save, delete                           |
| `/r1phun73r/api/articles/:slug/archive`  | POST              | Archive a draft                                |
| `/r1phun73r/api/articles/:slug/export`   | GET               | Download Markdown                              |
| `/r1phun73r/api/articles/:slug/media`    | GET, POST, DELETE | List, upload/replace, delete media             |
| `/r1phun73r/api/media/draft/:slug/:file` | GET               | Authenticated draft media preview              |
| `/r1phun73r/api/import`                  | POST              | Import Markdown                                |
| `/r1phun73r/api/deployment?sha=<40-hex>` | GET               | Pages status for a commit, when configured     |

Responses use `{ ok: true, data }` or `{ ok: false, error: { code, message,
details? } }`. Expected statuses include 400, 401, 403, 404, 409, 413, 415,
429, 502 and 503.

## Cloudflare Access setup

1. Create an Access application for `blog.adithiyan.me/r1phun73r` and a second
   for its API paths if your Access policy does not cover the whole prefix.
2. Add an allow policy for the editor's email. Do not use a shared mailbox.
3. Copy the application audience tag into `CF_ACCESS_AUD`.
4. Set `CF_ACCESS_TEAM_DOMAIN` to the team domain without `https://`.
5. Set `CMS_ALLOWED_EMAILS` to the same addresses, comma-separated.
6. Keep the Access session short enough for your risk tolerance; the CMS CSRF
   token expires after two hours.

Access failure returns JSON for API paths and a `noindex` HTML page for the
desk. The middleware applies admin headers to every successful response.

## GitHub App setup

1. Create a GitHub App owned by the repository owner.
2. Grant **Repository permissions → Contents: Read and write**. Grant nothing
   else unless a separate need is documented.
3. Install it on this repository only.
4. Set `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID` and
   `GITHUB_APP_PRIVATE_KEY` (PKCS#8 or PKCS#1 PEM; `\n` escapes are accepted).
5. Set `GITHUB_OWNER`, `GITHUB_REPO` and the protected production branch in
   `GITHUB_BRANCH`.
6. Make the repository private before enabling drafts. Then set
   `CMS_REPO_PRIVATE_CONFIRMED=true`.

The app token is cached until shortly before expiry. Do not reuse this app for
other repositories.

## Cloudflare Pages setup

- Connect the Pages project to the private GitHub repository.
- Build command: `npm run build`; output: `dist/`.
- Add all auth/GitHub variables as encrypted production variables and set
  `CMS_ENVIRONMENT=production`. Add preview values only if previews are
  private too.
- Optional deployment status: create a least-privilege Cloudflare API token
  with Pages read access, then set `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_PAGES_PROJECT`.
- Keep automatic deployments enabled so a CMS publish produces a new build.
- Add `drafts/` to `.gitignore` only as a belt-and-braces measure; the real
  protection is the private repository and the non-built path.

Never put secrets in `PUBLIC_*` variables or client code.

## Local development

```sh
cp .dev.vars.example .dev.vars
# fill local values; keep CMS_ENVIRONMENT=local, CMS_DEV_BYPASS=true
# and CMS_DEV_EMAIL set to the local editor identity
npm run build
npx wrangler pages dev dist
```

`wrangler` requires its install scripts to be approved by the package manager.
The bypass requires `CMS_DEV_BYPASS=true`, `CMS_ENVIRONMENT=local` and a
localhost hostname. It is always rejected when `CMS_ENVIRONMENT=production`
and on any Pages deployment that has not explicitly opted into local mode.
Production must set `CMS_ENVIRONMENT=production`.

Static page editing can still use `npm run dev`; API calls need the Pages
Functions runtime.

## Editorial workflow

1. Open the desk and sign in through Access.
2. Create or select an article.
3. Save a draft: commits `drafts/<slug>.md` and any draft media references.
4. Preview is sanitised locally; the real render happens at build time.
5. Publish: validates, copies used draft media into `public/images/<slug>/`,
   rewrites URLs, writes `src/content/articles/<slug>.md` and removes the
   draft in one commit.
6. Pages builds the commit. Use the deployment check to follow the SHA.
7. Archive or delete from the desk when a draft is no longer needed.

If a draft exists, publishing while viewing an older published version is
blocked so the draft cannot be silently discarded. Reload and review the
draft first.

## Media rules

- Accepted: PNG, JPEG, WebP, GIF, detected by signature.
- Rejected: SVG, HTML, scripts, polyglots with active prefixes.
- Limits: 8 MB per file, 8192 px per side, 40 megapixels, 10 files per upload.
- Alt text is required. Captions are optional.
- Filenames are normalised; paths are scoped to the article slug.
- Published media can only be uploaded for an already published article.
- Replacing keeps the existing URL and format.
- Deleting scans article, draft and archive sources for references first.

## Verification

```sh
npm run check
```

The suite covers route-level unauthenticated rejection, public draft exclusion,
CMS auth/CSRF, bounded uploads, media inspection, validation, privacy gating,
admin headers and admin/crawler separation.

Manual checks after a deployment:

1. Sign in through Access; confirm a non-allowlisted account is refused.
2. Save a draft with a test marker; confirm the marker is absent from
   `dist/`, RSS, sitemap and search after a build.
3. Publish a fixture with media; confirm the public URL and `lastmod`.
4. Confirm `/r1phun73r/` returns `noindex` and `no-store` headers, and that a
   draft media URL also requires Access and returns `no-store`.
5. Confirm a wrong CSRF token and a cross-origin write are rejected.
6. Confirm an unauthenticated API request returns 401 before any GitHub call.
7. Confirm deployment status reports "not configured" when credentials are
   absent rather than claiming success.

## Troubleshooting

| Symptom            | Check                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| 401                | Access application audience/team domain; JWT header present                  |
| 403                | Email not in `CMS_ALLOWED_EMAILS`; stale/foreign CSRF token; Origin mismatch |
| 503 draft lock     | Repository is not private or `CMS_REPO_PRIVATE_CONFIRMED` is not `true`      |
| 503 config         | Missing auth/GitHub variables; inspect server logs, never echo values        |
| 409                | Stale tab or external edit; reload before saving                             |
| 415 media          | Real format not PNG/JPEG/WebP/GIF; SVG is intentionally refused              |
| 429                | Rate limit reached; wait for the retry window                                |
| Deployment unknown | Pages token/account/project missing, or build has not started                |
