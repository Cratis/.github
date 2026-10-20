# .github

This is the landing repo for Cratis.
Please read more in our [profile](./profile/README.md).

## Organization activity stats

The daily workflow refreshes [`stats/org-stats.json`](./stats/org-stats.json), the
release calendar, and the marked profile block at 04:17 UTC. Only public,
non-archived, non-fork repositories are included. It uses the repository's
`GITHUB_TOKEN`; no organization-wide PAT is needed. Release totals are recomputed
by paging **all** published releases, so deleted and backfilled releases are
reflected on the next run. Counts use UTC calendar days including the current
partial day; the weekly digest uses its exact lookback window instead. The
calendar shows the snapshot's 365 daily values on a Monday-first 53-week grid.

Release kinds compare each tag with the previous published release in that same
repository. Prereleases are counted separately; first, non-semver, repeated or
non-increasing versions are `initial` and are not included in the major/minor/patch
split. Merged pull requests and issues are paged per repository in updated-date
order, with at most four repositories in flight. Pagination stops once updates
predate the earliest required window (365 days, the first of 53 ISO weeks, or
an extended digest lookback); all activity counts are derived locally.
Contributor discovery uses the fetched merge history to exclude established
contributors. Only remaining non-bot candidates need one org-scoped, date-only
pre-window search each, paced through a single GraphQL queue. Creation order
is never assumed to be merge order.

The weekly digest includes week-in-numbers and optionally posts to Discord.
Configure `DISCORD_WEBHOOK_URL` to enable weekly posts and daily milestone
celebrations. Missing webhooks are skipped; Discord failures only warn. A newly
reached milestone means its id was absent from the previously committed snapshot.

Run locally (requires Node.js 22+ and an authenticated GitHub CLI):

```sh
GITHUB_TOKEN="$(gh auth token)" node .github/scripts/publish-org-stats.cjs
node --test .github/scripts/
```

The collector writes the snapshot, SVG and profile block only when fields other
than `generatedAt` change. `ORG_STATS_SAMPLES=.ai-work/org-stats` additionally
writes sample weekly Markdown and a Discord payload without posting anything.
