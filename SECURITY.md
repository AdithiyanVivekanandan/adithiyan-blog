# Security policy

This is a personal technical publication maintained by one person. The public
site is pre-rendered HTML, CSS and a small amount of JavaScript. The private
publishing desk at `/r1phun73r/` uses Cloudflare Access, Pages Functions and a
GitHub App; it has one authorised editor, no reader accounts, no database and
no analytics.

## Supported versions

Security fixes are applied to the latest `main` branch as issues are
confirmed. There are no maintained release branches, long-term-support
versions, or response-time guarantees.

## Reporting a vulnerability

Report vulnerabilities privately through the repository's **Security** tab
using private vulnerability reporting. Do not open a public issue or pull
request containing vulnerability details.

Please include:

- Steps to reproduce the issue.
- The impact if the issue were exploited.
- Affected versions, commits, or URLs.
- A proof of concept where one is safe to share.

## Disclosure

Please follow responsible disclosure: do not disclose a vulnerability
publicly before a fix is available or a coordinated disclosure date is
agreed. Reports are handled on a best-effort basis alongside normal
maintenance of this publication.

## Scope

In scope: defects in this repository that could bypass Cloudflare Access or
the GitHub App boundary, expose unpublished drafts or media, inject executable
content into built or preview pages, forge a write or CSRF token, leak secrets,
or compromise reader privacy or site availability.

The public site is static; reports that assume arbitrary server-side execution
outside Pages Functions are out of scope. The admin desk is intentionally not
indexed or linked from public navigation.

Out of scope: vulnerabilities in third-party services (GitHub, the hosting
provider, npm, or upstream packages) should be reported to those vendors;
content accuracy issues such as typos, broken links, or factual errors in
articles are handled under the publication's correction policy, not through
this security process.
