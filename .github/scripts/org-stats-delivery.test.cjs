// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { aggregate, prepareReleases, deliveryLeadTime, weekNumbers } = require('./org-stats.cjs');
const { collectOrgStats, collectCounts } = require('./collect-org-stats.cjs');
const { calendarTitle, humanDuration, renderCalendar, renderProfile, renderWeekNumbers } = require('./render-org-stats.cjs');
const now = '2026-10-21T04:00:00.000Z';
const publishedAt = '2026-10-20T12:00:00.000Z';
const before = minutes => new Date(Date.parse(publishedAt) - minutes * 60000).toISOString();
const release = (oid, extra = {}) => ({ repository: 'Stage', tagCommit: { oid }, publishedAt, ...extra });
const pr = (oid, minutes, extra = {}) => ({ repository: { name: 'Stage' }, mergeCommit: { oid }, mergedAt: before(minutes), createdAt: before(minutes + 60), ...extra });
function repository(name, dates) {
    return { name, url: `https://github.com/Cratis/${name}`, releases: dates.map((publishedAt, i) => ({
        tagName: `v1.0.${i}`, publishedAt, url: `https://github.com/Cratis/${name}/releases/tag/v1.0.${i}`, tagCommit: { oid: `${name}-${i}` }
    })) };
}
function input(repositories = []) {
    return { org: 'Cratis', now, repositories, counts: collectCounts(now, undefined, [], []), contributors: [], pullRequests: [] };
}
test('matches only equal commit oids in the same repository and counts stable and prerelease releases', () => {
    const repositories = [repository('Stage', [publishedAt, publishedAt])];
    repositories[0].releases[1].isPrerelease = true;
    const prepared = prepareReleases(repositories, now);
    assert.deepEqual(prepared.map(r => r.tagCommit.oid), ['Stage-0', 'Stage-1']);
    const result = deliveryLeadTime([...prepared, release('other'), release('missing'), release('deleted', { tagCommit: null })],
        [pr('Stage-0', 2.123), pr('Stage-1', 4.567), pr('other', 1, { repository: { name: 'Arc' } }), pr(null, 1)]);
    assert.deepEqual(result, { matchedReleases: 2, mergeToRelease: { medianMinutes: 2.1, p90Minutes: 4.6 },
        openedToRelease: { medianMinutes: 62.1, p90Minutes: 64.6 } });
});
test('ignores absent commits, invalid dates and nonpositive durations; omits lead time without matches', () => {
    const invalid = [pr('zero', 0), pr('negative', -1), pr('opened-zero', 2, { createdAt: publishedAt }),
        pr('opened-negative', 2, { createdAt: before(-1) }), pr('invalid', 2, { createdAt: 'invalid' }),
        pr('missing-date', 2, { mergedAt: null }), pr('missing-commit', 2, { mergeCommit: null })];
    assert.equal(deliveryLeadTime(invalid.map((_, i) => release(['zero', 'negative', 'opened-zero', 'opened-negative', 'invalid', 'missing-date', 'missing-commit'][i])), invalid), undefined);
    assert.equal(deliveryLeadTime([release(null), release('absent', { tagCommit: undefined })], [pr(null, 2)]), undefined);
    assert.equal(Object.hasOwn(aggregate(input()), 'deliveryLeadTime'), false);
});
test('percentiles use numeric sorting and nearest rank, including a single sample and repeated release commits', () => {
    const minutes = [100, 2, 11, 4, 9, 6, 8, 7, 5, 3, 10];
    const result = deliveryLeadTime(minutes.map((_, i) => release(String(i))), minutes.map((m, i) => pr(String(i), m)));
    assert.deepEqual(result.mergeToRelease, { medianMinutes: 7, p90Minutes: 11 });
    const single = deliveryLeadTime([release('one')], [pr('one', 0.25)]);
    assert.deepEqual(single.mergeToRelease, { medianMinutes: 0.3, p90Minutes: 0.3 });
    assert.equal(deliveryLeadTime([release('one'), release('one')], [pr('one', 1)]).matchedReleases, 2);
});
test('daily repositories include all releasing repos, sort ties by name and leave empty days empty; weekly top five uses seven UTC days', () => {
    const repositories = ['Zulu', 'Stage', 'Arc', 'Chronicle', 'Delta', 'Echo'].map(name => repository(name, [publishedAt]));
    repositories[1].releases.push(...repository('Stage', [publishedAt]).releases);
    repositories.push(repository('Old', ['2026-10-14T23:59:59.000Z']));
    repositories.push(repository('Boundary', ['2026-10-15T00:00:00.000Z']));
    repositories.push(repository('Future', [now]));
    const snapshot = aggregate(input(repositories));
    const expected = [{ name: 'Stage', releases: 2 }, ...['Arc', 'Chronicle', 'Delta', 'Echo', 'Zulu'].map(name => ({ name, releases: 1 }))];
    assert.deepEqual(snapshot.daily.find(d => d.date === '2026-10-20').repositories, expected);
    assert.deepEqual(snapshot.daily.at(-1).repositories, []);
    assert.deepEqual(snapshot.daily[0].repositories, []);
    assert.deepEqual(snapshot.releasesThisWeek, [expected[0], { name: 'Arc', releases: 1 }, { name: 'Boundary', releases: 1 }, { name: 'Chronicle', releases: 1 }, { name: 'Delta', releases: 1 }]);
    for (const day of snapshot.daily) assert.equal(day.repositories.reduce((sum, r) => sum + r.releases, 0), day.releases);
});
test('snapshot uses 30 UTC days while digest lead time uses the exact digest window', () => {
    const repositories = [repository('Stage', ['2026-09-21T23:59:59.000Z', '2026-09-22T00:00:00.000Z', '2026-10-14T03:59:59.000Z', '2026-10-14T04:00:00.000Z', now])];
    const f = input(repositories);
    f.pullRequests = repositories[0].releases.map(r => ({ repository: { name: 'Stage' }, mergeCommit: r.tagCommit,
        mergedAt: new Date(Date.parse(r.publishedAt) - 120000).toISOString(), createdAt: new Date(Date.parse(r.publishedAt) - 3600000).toISOString() }));
    const snapshot = aggregate(f);
    assert.equal(snapshot.deliveryLeadTime.windowDays, 30);
    assert.equal(snapshot.deliveryLeadTime.matchedReleases, 3);
    const numbers = weekNumbers({ ...f, releases: prepareReleases(repositories, now), streak: snapshot.releases.streak,
        since: '2026-10-14T04:00:00.000Z', until: now });
    assert.equal(numbers.deliveryLeadTime.matchedReleases, 1);
    assert.deepEqual(numbers.deliveryLeadTime.mergeToRelease, { medianMinutes: 2, p90Minutes: 2 });
    assert.equal(Object.hasOwn(weekNumbers({ ...f, pullRequests: [], releases: [], streak: snapshot.releases.streak, since: now, until: now }), 'deliveryLeadTime'), false);
});
test('calendar titles show the top three, remaining count and XML-escaped repository names; old snapshots still render', () => {
    const repositories = ['Stage', 'Arc', 'Chronicle', 'Delta', 'Echo'].map((name, i) => ({ name, releases: 30 - i }));
    assert.equal(calendarTitle({ date: '2026-10-19', releases: 165, repositories }), '2026-10-19: 165 releases — Stage 30, Arc 29, Chronicle 28 and 2 more repositories');
    assert.equal(calendarTitle({ date: '2026-10-19', releases: 0, repositories: [] }), '2026-10-19: 0 releases');
    const snapshot = aggregate(input([repository('A&B', [publishedAt])]));
    assert.match(renderCalendar(snapshot), /2026-10-20: 1 releases — A&amp;B 1/);
    snapshot.daily.forEach(d => delete d.repositories);
    assert.match(renderCalendar(snapshot), /2026-10-20: 1 releases<\/title>/);
});
test('profile keeps its top-three linked release leaders on one line and supports older snapshots', () => {
    const snapshot = aggregate(input(['Arc', 'Chronicle', 'Stage', 'Zulu'].map(name => repository(name, [publishedAt]))));
    const text = renderProfile(snapshot);
    assert.match(text, /release streak\.\n\nMost releases this week:/);
    assert.equal(text.split('\n').find(line => line.startsWith('Most releases')), 'Most releases this week: [Arc](https://github.com/Cratis/Arc) 1 · [Chronicle](https://github.com/Cratis/Chronicle) 1 · [Stage](https://github.com/Cratis/Stage) 1');
    delete snapshot.releasesThisWeek;
    assert.doesNotMatch(renderProfile(snapshot), /Most releases/);
    snapshot.releasesThisWeek = [];
    assert.doesNotMatch(renderProfile(snapshot), /Most releases/);
});
test('human durations use minutes, hours and days with singular and sub-minute handling', () => {
    for (const [minutes, expected] of [[0.1, '< 1 minute'], [1, '1 minute'], [2.1, '2 minutes'], [59, '59 minutes'], [60, '1 hour'], [120, '2 hours'], [1440, '1 day'], [2880, '2 days']]) {
        assert.equal(humanDuration(minutes), expected);
    }
});
test('digest renders lead time only when present, using the shared human duration helper', () => {
    const numbers = { releases: 0, kinds: {}, mergedPullRequests: 0, issuesClosed: 0, busiestRepository: null, currentStreak: 0, firstTime: [] };
    assert.doesNotMatch(renderWeekNumbers(numbers), /From merge to release/);
    numbers.deliveryLeadTime = { mergeToRelease: { medianMinutes: 0.3, p90Minutes: 120 } };
    assert.match(renderWeekNumbers(numbers), /- From merge to release: median \*\*< 1 minute\*\* \(90% within 2 hours\)\./);
});
test('collector selects the extra commit and creation fields and passes PRs to snapshot and exact-window digest without extra calls', async () => {
    const calls = [], meta = { isPrivate: false, isArchived: false, isFork: false };
    const page = nodes => ({ nodes, pageInfo: { hasNextPage: false } });
    const repo = repository('Stage', [publishedAt]);
    const github = { graphql: async query => {
        calls.push(query);
        if (query.includes('organization(login:')) return { organization: { repositories: page([{ name: repo.name, url: repo.url, ...meta }]) } };
        if (query.includes('r0: repository')) {
            assert.match(query, /tagCommit \{ oid \}/);
            return { r0: { ...meta, releases: page(repo.releases) } };
        }
        if (query.includes('pullRequests(')) {
            assert.match(query, /createdAt mergeCommit \{ oid \}/);
            return { repository: { ...meta, pullRequests: page([pr('Stage-0', 2, { updatedAt: before(2) })]) } };
        }
        assert.match(query, /issues\(/);
        return { repository: { ...meta, issues: page([]) } };
    } };
    const result = await collectOrgStats({ github, now, digestSince: '2026-10-14T04:00:00.000Z', pause: async () => {}, progress: () => {} });
    assert.equal(calls.length, 4);
    assert.equal(result.snapshot.deliveryLeadTime.matchedReleases, 1);
    assert.equal(result.numbers.deliveryLeadTime.matchedReleases, 1);
    assert.deepEqual(result.numbers.deliveryLeadTime.mergeToRelease, { medianMinutes: 2, p90Minutes: 2 });
});
