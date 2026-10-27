# Operations runbook

Recovery and maintenance procedures for this publication. The full QA and
operations specification lives in
`docs/06_qa_launch_and_operations_runbook.docx`; this file records the
concrete, repository-specific version of the same procedures.

## Continuous protection

- Content and configuration are canonical in Git. Any deployed state can be
  reproduced from a commit with `npm ci && npm run build`.
- CI (`.github/workflows/ci.yml`) builds and tests every pull request and
  every push to the production branch; it never deploys.
- `npm run check` is the local equivalent of CI and must pass before every
  merge.

## Release

1. Confirm the production build is green (`npm run check`).
2. Merge to the protected production branch through a reviewed pull request.
3. The host builds and publishes from the connected repository; no manual
   artifact transfer is used.
4. Smoke-test on the production domain: homepage, an article route, search,
   RSS, sitemap, robots.txt and the 404 behavior. Verify the theme toggle
   still persists.
5. Confirm `/r1phun73r/` redirects to Access for an unauthenticated request
   and returns `X-Robots-Tag: noindex` plus `Cache-Control: no-store` after
   authentication. Do not publish a real article just to test the desk.

## Rollback

1. Identify the last known-good commit or deployment.
2. Redeploy it through the provider's own deployment mechanism (re-run the
   build from that commit or select the previous deployment in the host
   dashboard).
3. If the pipeline itself is suspected, pause automated deployments before
   retrying anything.
4. Smoke-test the same set of routes as a release before declaring recovery.

Rollback alone is insufficient if content, credentials or drafts leaked: see
"Secret exposure" below.

## Secret exposure or suspected leak

1. Revoke and rotate the exposed credential immediately. Deleting the text
   from the latest commit is not enough — assume history, caches and clones
   retained it.
2. Search repository history and the built `dist/` bundle for the exposed
   value.
3. Audit provider logs (GitHub, host, registrar) for unexpected activity
   since the first possible exposure.
4. Record what was exposed, when it was noticed and what was rotated.

## Compromised account response

1. From a trusted device, secure the account: revoke active sessions and
   tokens, change credentials, and re-verify recovery codes.
2. Verify DNS records and recent deployments for tampering.
3. Restore DNS or content from a known-good commit if tampering is found.
4. Check whether any personal data or drafts were published; purge caches and
   request search re-indexing if private content leaked.

## Publishing desk recovery

1. If Access is misconfigured, restore the Access application and policy in
   the Cloudflare dashboard. Do not disable Access to "test" the API.
2. If the GitHub App is revoked or expired, rotate the private key, update
   `GITHUB_APP_PRIVATE_KEY` and redeploy Pages. Check that the installation is
   still limited to this repository.
3. If `CMS_REPO_PRIVATE_CONFIRMED` is reset accidentally, draft writes return
   `503` by design. Confirm the repository is private before restoring it.
4. If Pages is building the wrong branch, fix `GITHUB_BRANCH` and the Pages
   production branch together. A CMS commit to an unbuilt branch is not
   published.
5. If deployment status is unavailable, inspect the commit in GitHub and the
   Pages dashboard. Do not assume success from a CMS toast alone.
6. If a draft or draft media is exposed, make the repository private, rotate
   credentials, remove the files in a reviewed commit, and treat it as a
   content leak below.

## Content restore

- Reverting a bad article is a Git revert plus a redeploy.
- If unpublished drafts appeared in public output, the draft-exclusion tests
  in `tests/` must be failing, the Astro content glob changed, or `drafts/`
  was moved under `src/content/`; investigate before trusting any other
  output.
- CMS drafts are recoverable from `drafts/<slug>.md`; export Markdown from the
  desk before deleting a draft if the text may still be needed.
- Purge provider caches for affected routes after removing leaked content.

## Domain and HTTPS recovery

1. The registrar account and DNS must stay locked (transfer lock, MFA) per
   `docs/adr/0001-technology-stack-and-content-workflow.md`.
2. If the certificate fails, verify DNS still points at the provider and
   re-issue the certificate through the host.
3. After any DNS change, re-verify the canonical URL, HTTP→HTTPS redirect and
   the sitemap/robots endpoints.

## Maintenance cadence

- Weekly while actively developing: review dependency alerts
  (Dependabot is configured for npm and GitHub Actions) and fix build
  failures.
- Monthly: check domain renewal, backup freshness, broken links and
  dependency health.
- Quarterly: review account access, tokens, DNS, headers and these
  procedures; restore-test from a clean clone.
