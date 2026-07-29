## Summary

Prepare the reviewed GlucoseIQ package candidate for publication. Keep this pull request in draft until every pre-publication gate through **Metadata and approval** has direct evidence. The trusted-publishing items remain mandatory after bootstrap, when the package pages exist.

## Domain and documentation

- [ ] Confirm domain registration is active at the registrar.
- [ ] Confirm the Vercel production deployment is healthy on the release candidate.
- [ ] Verify the apex and www redirect behavior over HTTPS.
- [ ] Exercise documentation search, routes, robots, and sitemap on the production domain.

## Package candidate

- [ ] Review all package versions and changelogs against the approved release entries.
- [ ] Review packed manifests and tarball contents, including declaration routes and internal dependency ranges.
- [ ] Confirm the release branch is current with main and no newer Changesets remain before merge.
- [ ] Confirm the clean consumer matrix passes for both React peer majors, both module systems, both TypeScript resolvers, the CLI.

## Bootstrap credential

- [ ] Create the one-day npm credential with only the five required package permissions and 2FA bypass.
- [ ] Replace the repository npm secret immediately before the approved bootstrap publication.

## Metadata and approval

- [ ] Complete the public metadata scan for source, maps, commits, and this pull-request text.
- [ ] Record final publication approval only after the domain, docs, versions, changelogs, and packed artifacts are confirmed.

## Trusted publishing migration

This post-bootstrap section is a durable follow-up record, not a pre-merge gate for this release pull request.

- [ ] Confirm a trusted publisher configured for all five packages after their package pages exist.
- [ ] Confirm workflow token references and the repository npm secret removed before the credential-free release.
- [ ] Confirm the first credential-free publication succeeds with provenance.
- [ ] Confirm the temporary credential expired or was revoked after trusted publishing succeeds.
- [ ] Require 2FA and disallow token publication on every package after trusted publishing is proven.
