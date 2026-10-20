// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { collectRepositories, firstTimeContributors, searchClient } = require('./collect-org-stats.cjs');
const { collectActivity, activityStart } = require('./org-stats-activity.cjs');
const { progressLogger, wait } = require('./org-stats-client.cjs');
const { prepareReleases, version, kinds, repositoryReleases, streaks, milestones, deliveryLeadTime, date, shift } = require('./org-stats.cjs');

function yearWindow(year, now = new Date()) {
    now = new Date(now);
    const current = now.getUTCFullYear();
    const selected = year === undefined || year === '' ? current - (now.getUTCMonth() === 0 && now.getUTCDate() === 1 ? 1 : 0) : Number(year);
    if (!Number.isInteger(selected) || selected < 1000 || selected > current) throw new Error('year must be a calendar year from 1000 through the current year');
    const since = `${selected}-01-01T00:00:00.000Z`, end = `${selected + 1}-01-01T00:00:00.000Z`;
    return { year: selected, since, until: now.toISOString() < end ? now.toISOString() : end, partial: now.toISOString() < end };
}
function repositoryYears(releases) {
    return repositoryReleases(releases).map(repository => {
        const items = releases.filter(r => r.repository === repository.name);
        return { ...repository, url: items[0].repositoryUrl, first: items[0].tag, last: items.at(-1).tag };
    });
}
function versionJumps(releases) {
    return repositoryYears(releases.filter(r => version(r.tag) && !version(r.tag).prerelease && r.kind !== 'prerelease'))
        .map(r => ({ ...r, major: version(r.last).parts[0] - version(r.first).parts[0], minor: version(r.last).parts[1] - version(r.first).parts[1] }))
        .filter(r => r.major > 0 || r.major === 0 && r.minor > 0)
        .sort((a, b) => b.major - a.major || b.minor - a.minor || a.name.localeCompare(b.name)).slice(0, 5);
}
function wrappedNumbers({ window, releases, pullRequests, issues, contributors }) {
    const inside = value => value && value >= window.since && value < window.until;
    const selected = releases.filter(r => inside(r.publishedAt));
    const merged = pullRequests.filter(pr => inside(pr.mergedAt));
    const months = Array.from({ length: 12 }, (_, i) => {
        const month = `${window.year}-${String(i + 1).padStart(2, '0')}`;
        return { month, releases: selected.filter(r => r.publishedAt.startsWith(month)).length,
            mergedPullRequests: merged.filter(pr => pr.mergedAt.startsWith(month)).length };
    // A preview of a year in progress stops at the current month instead of listing empty future months.
    }).filter(m => `${m.month}-01T00:00:00.000Z` < window.until);
    const days = new Map();
    for (const release of selected) {
        const day = date(release.publishedAt);
        if (!days.has(day)) days.set(day, []);
        days.get(day).push(release);
    }
    const busiest = [...days].sort((a, b) => b[1].length - a[1].length || b[0].localeCompare(a[0]))[0];
    const streak = streaks(selected, date(window.until));
    return { ...window, releases: selected.length, kinds: kinds(selected), mergedPullRequests: merged.length,
        issuesClosed: issues.filter(issue => inside(issue.closedAt)).length, repositoriesReleased: new Set(selected.map(r => r.repository)).size,
        months, topRepositories: repositoryYears(selected).slice(0, 5), versionJumps: versionJumps(selected),
        busiestDay: busiest ? { date: busiest[0], count: busiest[1].length, repositories: repositoryReleases(busiest[1]).slice(0, 3) } : null,
        streak: { days: streak.longestDays, start: streak.longestEndedOn ? shift(streak.longestEndedOn, 1 - streak.longestDays) : null, end: streak.longestEndedOn },
        deliveryLeadTime: deliveryLeadTime(selected, pullRequests), firstTime: contributors.filter(c => inside(c.firstMergedAt)),
        milestones: milestones(releases, streaks(releases, date(window.until))).reached.filter(m => m.reachedOn >= date(window.since) && inside(`${m.reachedOn}T00:00:00.000Z`)) };
}
async function collectWrapped({ github, org = 'Cratis', year, now = new Date(), pause = wait, progress = progressLogger(), clock = Date.now }) {
    const window = yearWindow(year, now), options = { pause, progress, clock };
    const repositories = await collectRepositories(github, org, options);
    if (!repositories.length) throw new Error('No eligible public repositories found');
    // Reuse the configurable activity cutoff so January is never truncated by
    // a rolling 365-day window, including historical and leap-year recaps.
    const { pullRequests, issues } = await collectActivity(github, org, repositories, activityStart(window.until, window.since), window.until, options);
    const contributors = await firstTimeContributors(searchClient(github, pause, { progress, clock }), org, pullRequests, window.since);
    return wrappedNumbers({ window, releases: prepareReleases(repositories.filter(r => !r.excluded), window.until), pullRequests, issues, contributors });
}
module.exports = { yearWindow, repositoryYears, versionJumps, wrappedNumbers, collectWrapped };
