// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const DAY = 86400000;
const scope = 'public, non-archived, non-fork repositories';
const date = value => new Date(value).toISOString().slice(0, 10);
const shift = (value, days) => date(new Date(value).getTime() + days * DAY);
function monday(value) {
    const day = new Date(value).getUTCDay();
    return shift(value, -(day === 0 ? 6 : day - 1));
}
function monthStart(value, offset = 0) {
    const d = new Date(value);
    return date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
}
function isBot(author) {
    return !author || author.__typename === 'Bot' || /\[bot\]$/i.test(author.login) ||
        /^(copilot-swe-agent|copilot|cratis-bot|dependabot|renovate)$/i.test(author.login);
}
function version(tag) {
    const match = String(tag).match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/);
    return match && { parts: match.slice(1, 4).map(Number), prerelease: Boolean(match[4]) };
}
// Unknown/non-semver tags and the first stable release are initial, never patches.
function classifyRelease(current, previous) {
    const next = version(current);
    const prior = version(previous);
    if (next?.prerelease) return 'prerelease';
    if (!next || !prior) return 'initial';
    for (const [index, kind] of ['major', 'minor', 'patch'].entries()) {
        if (next.parts[index] !== prior.parts[index]) return next.parts[index] > prior.parts[index] ? kind : 'initial';
    }
    return 'initial';
}
function prepareReleases(repositories, now) {
    return repositories.flatMap(repository => {
        let previous;
        return repository.releases.filter(r => !r.isDraft && r.publishedAt && r.publishedAt <= now)
            .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.tagName.localeCompare(b.tagName))
            .map(release => {
                const item = { repository: repository.name, repositoryUrl: repository.url, tag: release.tagName,
                    url: release.url, publishedAt: release.publishedAt, kind: release.isPrerelease ? 'prerelease' : classifyRelease(release.tagName, previous) };
                previous = release.tagName;
                return item;
            });
    }).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.repository.localeCompare(b.repository) || a.tag.localeCompare(b.tag));
}
function streaks(releases, today) {
    const days = [...new Set(releases.map(r => date(r.publishedAt)))].sort();
    let length = 0, longestDays = 0, longestEndedOn = null, previous;
    for (const day of days) {
        length = previous && shift(previous, 1) === day ? length + 1 : 1;
        if (length >= longestDays) { longestDays = length; longestEndedOn = day; }
        previous = day;
    }
    return { currentDays: previous === today || previous === shift(today, -1) ? length : 0, longestDays, longestEndedOn };
}
function kinds(releases) {
    return Object.fromEntries(['major', 'minor', 'patch', 'prerelease'].map(kind => [kind, releases.filter(r => r.kind === kind).length]));
}
function milestones(releases, streak) {
    const reached = [], next = [];
    const releaseLadder = [1000, 2500, 5000, 7500, 10000, 15000, 20000, 25000, 50000, 100000];
    for (const n of releaseLadder) {
        const item = { id: `releases-all-time-${n}`, label: `${n.toLocaleString('en-US')} releases` };
        if (releases.length >= n) reached.push({ ...item, reachedOn: date(releases[n - 1].publishedAt) });
        else if (!next.some(m => m.id.startsWith('releases-all-time-'))) next.push({ ...item, remaining: n - releases.length });
    }
    const days = [...new Set(releases.map(r => date(r.publishedAt)))].sort();
    for (const n of [30, 50, 100, 150, 200, 250, 300, 365, 500, 730, 1000]) {
        const item = { id: `streak-${n}`, label: `${n}-day release streak` };
        let run = 0, previous, reachedOn;
        for (const day of days) {
            run = previous && shift(previous, 1) === day ? run + 1 : 1;
            if (run === n) { reachedOn = day; break; }
            previous = day;
        }
        if (reachedOn) reached.push({ ...item, reachedOn });
        if (n > streak.currentDays && !next.some(m => m.id.startsWith('streak-'))) next.push({ ...item, remaining: n - streak.currentDays });
    }
    reached.sort((a, b) => b.reachedOn.localeCompare(a.reachedOn) || a.id.localeCompare(b.id));
    return { reached, next };
}
function windows(now) {
    const today = date(now), end = new Date(now).toISOString();
    const weekly = Array.from({ length: 53 }, (_, i) => {
        const start = shift(monday(today), (i - 52) * 7);
        return { start, end: i === 52 ? end : shift(start, 7) };
    });
    const monthly = Array.from({ length: 12 }, (_, i) => ({ start: monthStart(today, i - 11), end: i === 11 ? end : monthStart(today, i - 10) }));
    return { today, end, weekly, monthly, since: n => `${shift(today, 1 - n)}T00:00:00.000Z` };
}
function aggregate({ org, now, repositories, counts, contributors, pullRequests }) {
    const w = windows(now), releases = prepareReleases(repositories, w.end);
    const during = (start, end = w.end) => releases.filter(r => r.publishedAt >= start && r.publishedAt < end);
    const recent = n => during(w.since(n));
    const allDays = new Map();
    for (const r of releases) allDays.set(date(r.publishedAt), (allDays.get(date(r.publishedAt)) || 0) + 1);
    const calendarDays = new Map();
    for (const r of recent(365)) calendarDays.set(date(r.publishedAt), (calendarDays.get(date(r.publishedAt)) || 0) + 1);
    const daily = Array.from({ length: 365 }, (_, i) => {
        const day = shift(w.today, i - 364);
        return { date: day, releases: calendarDays.get(day) || 0 };
    });
    const busiest = [...allDays].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
    const streak = streaks(releases, w.today);
    return {
        schemaVersion: 1, generatedAt: w.end, organization: org, scope, repositoryCount: repositories.length,
        releases: { last7Days: recent(7).length, last30Days: recent(30).length, last90Days: recent(90).length,
            last365Days: recent(365).length, allTime: releases.length, averagePerDayLast30Days: Number((recent(30).length / 30).toFixed(1)),
            last365DaysByKind: kinds(recent(365)), last7DaysByKind: kinds(recent(7)),
            busiestDay: { date: busiest?.[0] ?? null, count: busiest?.[1] ?? 0 }, streak },
        mergedPullRequests: { last7Days: counts.pr7, last30Days: counts.pr30, last365Days: counts.pr365,
            dependencyUpdatesLast7Days: pullRequests.filter(p => p.mergedAt >= w.since(7) && /^(dependabot|renovate)(\[bot\])?$/i.test(p.author?.login || '')).length },
        issues: { openedLast7Days: counts.open7, closedLast7Days: counts.close7, closedLast30Days: counts.close30, closedLast365Days: counts.close365 },
        contributors: { activeLast30Days: new Set(pullRequests.filter(p => p.mergedAt >= w.since(30) && !isBot(p.author)).map(p => p.author.login)).size, firstTime: contributors },
        daily,
        weekly: w.weekly.map((window, i) => ({ weekStart: window.start, releases: during(window.start, window.end).length, mergedPullRequests: counts[`wpr${i}`], issuesClosed: counts[`wclose${i}`] })),
        monthly: w.monthly.map((window, i) => ({ month: window.start.slice(0, 7), releases: during(window.start, window.end).length, mergedPullRequests: counts[`mpr${i}`], issuesOpened: counts[`mopen${i}`], issuesClosed: counts[`mclose${i}`] })),
        repositories: repositories.map(repository => {
            const items = releases.filter(r => r.repository === repository.name), latest = items.at(-1);
            return latest && { name: repository.name, url: repository.url, releasesLast30Days: items.filter(r => r.publishedAt >= w.since(30)).length,
                releasesLast365Days: items.filter(r => r.publishedAt >= w.since(365)).length,
                latestRelease: { tag: latest.tag, url: latest.url, publishedAt: latest.publishedAt, kind: latest.kind } };
        }).filter(Boolean).sort((a, b) => b.releasesLast30Days - a.releasesLast30Days || a.name.localeCompare(b.name)),
        milestones: milestones(releases, streak)
    };
}
function weekNumbers({ releases, counts, contributors, streak, since, until }) {
    const selected = releases.filter(r => r.publishedAt >= since && r.publishedAt < until);
    const repos = new Map();
    for (const r of selected) repos.set(r.repository, (repos.get(r.repository) || 0) + 1);
    const busiest = [...repos].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { releases: selected.length, kinds: kinds(selected), mergedPullRequests: counts.digestPr, issuesClosed: counts.digestClose,
        busiestRepository: busiest ? { name: busiest[0], releases: busiest[1], url: selected.find(r => r.repository === busiest[0]).repositoryUrl } : null,
        currentStreak: streak.currentDays, firstTime: contributors.filter(c => c.firstMergedAt >= since && c.firstMergedAt < until) };
}
module.exports = { DAY, scope, date, shift, monday, monthStart, isBot, classifyRelease, prepareReleases, streaks, kinds, milestones, windows, aggregate, weekNumbers };
