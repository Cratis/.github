// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { yearWindow, wrappedNumbers, versionJumps, collectWrapped } = require('./collect-wrapped.cjs');
const { prepareReleases } = require('./org-stats.cjs');
const now = '2026-08-20T12:00:00.000Z';
const window = yearWindow(2024, now);
const release = (repository, tag, publishedAt, extra = {}) => ({ repository, tag, publishedAt, kind: 'minor', repositoryUrl: `https://github.com/Cratis/${repository}`, ...extra });
const pr = (login, mergedAt, extra = {}) => ({ mergedAt, updatedAt: mergedAt, repository: { name: 'Arc' },
    author: { __typename: 'User', login, url: `https://github.com/${login}` }, title: 'First PR', url: 'https://github.com/Cratis/Arc/pull/1', ...extra });
const numbers = extra => wrappedNumbers({ window, releases: [], pullRequests: [], issues: [], contributors: [], ...extra });

test('UTC year window defaults on January 1 and supports full historical leap years', () => {
    assert.deepEqual(window, { year: 2024, since: '2024-01-01T00:00:00.000Z', until: '2025-01-01T00:00:00.000Z', partial: false });
    assert.equal(yearWindow(undefined, '2027-01-01T23:59:59Z').year, 2026);
    assert.equal(yearWindow('', '2027-01-02T00:00:00Z').year, 2027);
    assert.equal(yearWindow(undefined, now).year, 2026);
    assert.equal(yearWindow(2026, now).until, now);
    assert.equal(yearWindow(2026, now).partial, true);
    for (const year of ['no', '2024.5', 999, 2027]) assert.throws(() => yearWindow(year, now), /year must be/);
});
test('month totals, release kinds and top repository versions use only the calendar year', () => {
    const releases = [release('Arc', 'v1.0.0', '2023-12-31T23:59:59.000Z'),
        release('Arc', 'v2.0.0', window.since, { kind: 'major' }), release('Arc', 'v2.1.0', '2024-02-29T12:00:00.000Z'),
        release('Arc', 'v2.1.1', '2024-12-31T23:59:59.999Z', { kind: 'patch' }),
        release('Arc', 'v3.0.0', window.until, { kind: 'major' })];
    const result = numbers({ releases, pullRequests: [pr('a', window.since), pr('b', window.until)],
        issues: [{ closedAt: window.since }, { closedAt: window.until }, { closedAt: null }] });
    assert.equal(result.releases, 3);
    assert.deepEqual(result.kinds, { major: 1, minor: 1, patch: 1, prerelease: 0 });
    assert.equal(result.mergedPullRequests, 1);
    assert.equal(result.issuesClosed, 1);
    assert.equal(result.repositoriesReleased, 1);
    assert.equal(result.months.length, 12);
    assert.deepEqual(result.months[1], { month: '2024-02', releases: 1, mergedPullRequests: 0 });
    assert.equal(result.months.reduce((n, m) => n + m.releases, 0), 3);
    assert.equal(result.topRepositories[0].first, 'v2.0.0');
    assert.equal(result.topRepositories[0].last, 'v2.1.1');
});
test('version jumps rank by major then minor with deterministic ties and a top five limit', () => {
    const releases = [];
    for (const [name, first, last] of [['A', 'v1.0.0', 'v3.4.0'], ['B', 'v1.0.0', 'v3.5.0'],
        ['C', 'v1.0.0', 'v2.99.0'], ['D', 'v1.0.0', 'v4.0.0'], ['E', 'v1.0.0', 'v2.0.0'],
        ['F', 'v1.0.0', 'v2.0.0'], ['G', 'v2.0.0', 'v1.0.0'], ['H', 'v1.0.0', 'v1.0.1']]) {
        releases.push(release(name, first, window.since), release(name, last, '2024-12-01T00:00:00.000Z'));
    }
    releases.push(release('A', 'v99.0.0-rc.1', '2024-12-02T00:00:00.000Z'), release('A', 'latest', '2024-12-03T00:00:00.000Z'));
    assert.deepEqual(versionJumps(releases).map(r => r.name), ['D', 'B', 'A', 'C', 'E']);
    assert.equal(versionJumps(releases)[1].major, 2);
    assert.equal(versionJumps(releases)[1].minor, 5);
});
test('daily streak is clipped to year boundaries and busiest day includes only top three repositories', () => {
    const releases = ['2023-12-30', '2023-12-31', '2024-01-01', '2024-01-02', '2024-01-03', '2024-12-31', '2025-01-01']
        .map(day => release('Arc', 'v1.0.0', `${day}T12:00:00.000Z`));
    for (const name of ['B', 'C', 'D', 'B']) releases.push(release(name, 'v1.0.0', '2024-01-02T13:00:00.000Z'));
    const result = numbers({ releases });
    assert.deepEqual(result.streak, { days: 3, start: '2024-01-01', end: '2024-01-03' });
    assert.deepEqual(result.busiestDay, { date: '2024-01-02', count: 5,
        repositories: [{ name: 'B', releases: 2 }, { name: 'Arc', releases: 1 }, { name: 'C', releases: 1 }] });
    assert.deepEqual(numbers().streak, { days: 0, start: null, end: null });
    assert.equal(numbers().busiestDay, null);
});
test('yearly delivery reuses commit matching, positive durations and nearest-rank percentiles', () => {
    const result = numbers({ releases: [release('Arc', 'v1.0.0', '2024-01-01T00:10:00.000Z', { tagCommit: { oid: 'abc' } }),
        release('Arc', 'v1.1.0', '2025-01-01T00:10:00.000Z', { tagCommit: { oid: 'abc' } })],
        pullRequests: [pr('a', '2024-01-01T00:00:00.000Z', { createdAt: '2023-12-31T23:00:00.000Z', mergeCommit: { oid: 'abc' } })] });
    assert.deepEqual(result.deliveryLeadTime, { matchedReleases: 1, mergeToRelease: { medianMinutes: 10, p90Minutes: 10 }, openedToRelease: { medianMinutes: 70, p90Minutes: 70 } });
});
test('milestone ladder uses all-time history but only reports milestones reached in the year', () => {
    const releases = Array.from({ length: 1000 }, (_, i) => release('Arc', `v1.${i}.0`, i === 999 ? window.since : '2023-12-01T00:00:00.000Z'));
    assert.deepEqual(numbers({ releases }).milestones, [{ id: 'releases-all-time-1000', label: '1,000 releases', reachedOn: '2024-01-01' }]);
    assert.equal(numbers({ releases: releases.map(r => ({ ...r, publishedAt: '2023-12-01T00:00:00.000Z' })) }).milestones.length, 0);
});
test('collector reuses pagination for an old full year and finds first-time non-bot contributors', async () => {
    const meta = { isPrivate: false, isArchived: false, isFork: false };
    const page = nodes => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } });
    const searches = [];
    const github = { graphql: async query => {
        if (query.includes('organization(login:')) return { organization: { repositories: page([{ ...meta, name: 'Arc', url: 'https://github.com/Cratis/Arc' }]) } };
        if (query.includes('r0: repository')) return { r0: { ...meta, releases: page([
            { tagName: 'v1.0.0', publishedAt: '2023-12-31T12:00:00.000Z' }, { tagName: 'v2.0.0', publishedAt: window.since },
            { tagName: 'v2.1.0', publishedAt: '2024-12-31T23:59:59.000Z' }, { tagName: 'v3.0.0', publishedAt: window.until }]) } };
        if (query.includes('pullRequests(')) return { repository: { ...meta, pullRequests: page([
            pr('new', window.since), pr('new', '2024-12-31T12:00:00.000Z'), pr('established', window.since),
            pr('known', '2023-12-30T12:00:00.000Z'), pr('known', window.since),
            pr('dependabot[bot]', window.since), pr('machine', window.since, { author: { __typename: 'Bot', login: 'machine' } }),
            pr('next-year', window.until)]) } };
        if (query.includes('issues(')) return { repository: { ...meta, issues: page([{ closedAt: '2024-12-31T23:59:59.000Z' }]) } };
        searches.push(query);
        return { search: { issueCount: /author:(established|known)/.test(query) ? 1 : 0 } };
    } };
    const result = await collectWrapped({ github, year: 2024, now, pause: async () => {}, progress: () => {}, clock: () => 0 });
    assert.equal(result.releases, 2);
    assert.equal(result.mergedPullRequests, 6);
    assert.equal(result.issuesClosed, 1);
    assert.deepEqual(result.firstTime.map(c => c.login), ['new']);
    assert.equal(result.firstTime[0].firstMergedAt, window.since);
    assert.equal(searches.length, 3);
    assert.ok(searches.every(query => query.includes('merged:<2024-01-01')));
    assert.equal(result.kinds.major, 1);
    assert.equal(result.topRepositories[0].last, 'v2.1.0');
});
test('release preparation keeps previous-year baseline for classifying the first release', () => {
    const releases = prepareReleases([{ name: 'Arc', releases: [{ tagName: 'v1.0.0', publishedAt: '2023-12-31T12:00:00.000Z' },
        { tagName: 'v2.0.0', publishedAt: window.since }] }], window.until);
    assert.equal(numbers({ releases }).kinds.major, 1);
});
