// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { shift, monday, monthStart, aggregate } = require('./org-stats.cjs');
const { countWindows } = require('./collect-org-stats.cjs');
const integer = value => assert.ok(Number.isInteger(value) && value >= 0, `Expected nonnegative integer: ${value}`);
const text = value => assert.equal(typeof value, 'string');
const day = value => { text(value); assert.match(value, /^\d{4}-\d{2}-\d{2}$/); assert.equal(new Date(value).toISOString().slice(0, 10), value); };
const timestamp = value => { text(value); assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/); assert.ok(Number.isFinite(Date.parse(value))); };
const url = value => { text(value); assert.equal(new URL(value).protocol, 'https:'); };
const kind = value => assert.ok(['major', 'minor', 'patch', 'prerelease', 'initial'].includes(value));
const shape = (value, properties) => { assert.ok(value && typeof value === 'object'); for (const [key, check] of Object.entries(properties)) { assert.ok(Object.hasOwn(value, key), `Missing ${key}`); check(value[key]); } };
const array = check => value => { assert.ok(Array.isArray(value)); value.forEach(check); };
const kinds = value => shape(value, { major: integer, minor: integer, patch: integer, prerelease: integer });
function validateSnapshot(s) {
    shape(s, {
        schemaVersion: value => assert.equal(value, 1), generatedAt: timestamp,
        organization: value => assert.equal(value, 'Cratis'), scope: value => assert.equal(value, 'public, non-archived, non-fork repositories'), repositoryCount: integer,
        releases: value => shape(value, { last7Days: integer, last30Days: integer, last90Days: integer, last365Days: integer, allTime: integer,
            averagePerDayLast30Days: n => { assert.equal(typeof n, 'number'); assert.equal(n, Number((s.releases.last30Days / 30).toFixed(1))); },
            last365DaysByKind: kinds, last7DaysByKind: kinds,
            busiestDay: v => shape(v, { date: v.count === 0 ? x => assert.equal(x, null) : day, count: integer }),
            streak: v => shape(v, { currentDays: integer, longestDays: integer, longestEndedOn: v.longestDays === 0 ? x => assert.equal(x, null) : day }) }),
        mergedPullRequests: v => shape(v, { last7Days: integer, last30Days: integer, last365Days: integer, dependencyUpdatesLast7Days: integer }),
        issues: v => shape(v, { openedLast7Days: integer, closedLast7Days: integer, closedLast30Days: integer, closedLast365Days: integer }),
        contributors: v => shape(v, { activeLast30Days: integer, firstTime: array(c => shape(c, { login: text, name: text, avatarUrl: url, profileUrl: url, firstMergedAt: timestamp, repository: text, pullRequestUrl: url, pullRequestTitle: text })) }),
        daily: array(d => shape(d, { date: day, releases: integer })),
        weekly: array(w => shape(w, { weekStart: day, releases: integer, mergedPullRequests: integer, issuesClosed: integer })),
        monthly: array(m => shape(m, { month: v => { text(v); assert.match(v, /^\d{4}-\d{2}$/); }, releases: integer, mergedPullRequests: integer, issuesOpened: integer, issuesClosed: integer })),
        repositories: array(r => shape(r, { name: text, url, releasesLast30Days: integer, releasesLast365Days: integer, latestRelease: v => shape(v, { tag: text, url, publishedAt: timestamp, kind }) })),
        milestones: m => shape(m, { reached: array(v => shape(v, { id: text, label: text, reachedOn: day })), next: array(v => shape(v, { id: text, label: text, remaining: integer })) })
    });
    const repositoryCounts = items => {
        array(r => shape(r, { name: text, releases: n => { integer(n); assert.ok(n > 0); } }))(items);
        assert.deepEqual(items, [...items].sort((a, b) => b.releases - a.releases || a.name.localeCompare(b.name)));
    };
    for (const d of s.daily) {
        if (!Object.hasOwn(d, 'repositories')) continue;
        repositoryCounts(d.repositories);
        assert.equal(d.repositories.reduce((sum, r) => sum + r.releases, 0), d.releases);
    }
    if (Object.hasOwn(s, 'releasesThisWeek')) {
        repositoryCounts(s.releasesThisWeek);
        assert.ok(s.releasesThisWeek.length <= 5);
    }
    if (Object.hasOwn(s, 'deliveryLeadTime')) {
        const minutes = n => { assert.ok(Number.isFinite(n) && n >= 0); assert.equal(n, Number(n.toFixed(1))); };
        const percentiles = v => {
            shape(v, { medianMinutes: minutes, p90Minutes: minutes });
            assert.ok(v.p90Minutes >= v.medianMinutes);
        };
        shape(s.deliveryLeadTime, { windowDays: n => assert.equal(n, 30), matchedReleases: n => { integer(n); assert.ok(n > 0); },
            mergeToRelease: percentiles, openedToRelease: percentiles });
        assert.ok(s.deliveryLeadTime.matchedReleases <= s.releases.last30Days);
    }
    const today = s.generatedAt.slice(0, 10);
    assert.equal(s.daily.length, 365); assert.equal(s.weekly.length, 53); assert.equal(s.monthly.length, 12);
    s.daily.forEach((d, i) => assert.equal(d.date, shift(today, i - 364)));
    s.weekly.forEach((w, i) => assert.equal(w.weekStart, shift(monday(today), (i - 52) * 7)));
    s.monthly.forEach((m, i) => assert.equal(m.month, monthStart(today, i - 11).slice(0, 7)));
    assert.equal(s.daily.reduce((sum, d) => sum + d.releases, 0), s.releases.last365Days);
    assert.equal(s.daily.slice(-7).reduce((sum, d) => sum + d.releases, 0), s.releases.last7Days);
    assert.ok(s.releases.allTime >= s.releases.last365Days);
    assert.ok(s.releases.streak.longestDays >= s.releases.streak.currentDays);
    const sorted = [...s.repositories].sort((a, b) => b.releasesLast30Days - a.releasesLast30Days || a.name.localeCompare(b.name));
    assert.deepEqual(s.repositories, sorted);
    assert.ok(s.repositories.length <= s.repositoryCount);
    for (let i = 1; i < s.contributors.firstTime.length; i++) assert.ok(s.contributors.firstTime[i - 1].firstMergedAt >= s.contributors.firstTime[i].firstMergedAt);
    for (let i = 1; i < s.milestones.reached.length; i++) assert.ok(s.milestones.reached[i - 1].reachedOn >= s.milestones.reached[i].reachedOn);
    const ladders = { 'releases-all-time': [1000, 2500, 5000, 7500, 10000, 15000, 20000, 25000, 50000, 100000], streak: [30, 50, 100, 150, 200, 250, 300, 365, 500, 730, 1000] };
    for (const m of [...s.milestones.reached, ...s.milestones.next]) assert.ok(Object.entries(ladders).some(([prefix, ladder]) => ladder.some(n => m.id === `${prefix}-${n}`)), `Invalid milestone ${m.id}`);
}
test('schema checks every required field and rejects a missing contract member', () => {
    const now = '2026-10-21T04:17:00.000Z';
    const counts = Object.fromEntries(countWindows(now).map(q => [q.key, 0]));
    const snapshot = aggregate({ org: 'Cratis', now, repositories: [], counts, contributors: [], pullRequests: [] });
    validateSnapshot(snapshot);
    delete snapshot.mergedPullRequests.dependencyUpdatesLast7Days;
    assert.throws(() => validateSnapshot(snapshot), /Missing dependencyUpdatesLast7Days/);
});
test('published live snapshot matches every schemaVersion 1 contract field', { skip: !fs.existsSync(path.join(__dirname, '../../stats/org-stats.json')) }, () => {
    validateSnapshot(JSON.parse(fs.readFileSync(path.join(__dirname, '../../stats/org-stats.json'), 'utf8')));
});
module.exports = { validateSnapshot };
