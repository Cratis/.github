// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { windows } = require('./org-stats.cjs');
const { collectActivity, collectCounts, countWindows, activityStart } = require('./org-stats-activity.cjs');
const { firstTimeContributors, searchClient, collectOrgStats } = require('./collect-org-stats.cjs');
const now = '2026-10-21T04:00:00.000Z';
const meta = { isPrivate: false, isArchived: false, isFork: false };
const quiet = { pause: async () => {}, progress: () => {}, clock: () => 0 };
const page = (nodes, hasNextPage = false, endCursor = 'next') => ({ nodes, pageInfo: { hasNextPage, endCursor } });
function pr(login, mergedAt, extra = {}) {
    return { id: `P-${login}-${mergedAt}`, number: 1, mergedAt, updatedAt: mergedAt, title: 'Contribution',
        url: 'https://github.com/Cratis/Widget/pull/1', repository: { name: 'Widget' },
        author: login ? { __typename: 'User', login, name: login, avatarUrl: `https://example.test/${login}`, url: `https://github.com/${login}` } : null, ...extra };
}
test('updated-order pagination retains exact start, filters merge dates, and stops strictly before start', async () => {
    const since = '2025-10-20T00:00:00.000Z', calls = [], logs = [];
    const github = { graphql: async (query, variables) => {
        calls.push(variables);
        assert.match(query, /first: 100, after: \$cursor/);
        assert.match(query, /orderBy: \{ field: UPDATED_AT, direction: DESC \}/);
        if (query.includes('pullRequests(')) {
            assert.match(query, /states: MERGED/);
            assert.match(query, /id number url title mergedAt updatedAt createdAt mergeCommit \{ oid \} author/);
            const nodes = variables.cursor === null ? [pr('new', '2026-10-20T00:00:00.000Z'),
                pr('old', '2020-01-01T00:00:00.000Z', { updatedAt: since }), pr('boundary', since)] :
                [pr('outside', '2025-10-19T23:59:59.000Z')];
            return { repository: { ...meta, pullRequests: page(nodes, true) } };
        }
        assert.doesNotMatch(query, /states:/);
        return { repository: { ...meta, issues: page([{ createdAt: '2025-10-19T23:59:59.000Z', closedAt: null, updatedAt: '2025-10-19T23:59:59.000Z' }], true) } };
    } };
    const records = await collectActivity(github, 'Cratis', [{ name: 'Widget' }], since, now, { ...quiet, progress: line => logs.push(line) });
    assert.deepEqual(records.pullRequests.map(p => p.author.login), ['new', 'boundary']);
    assert.deepEqual(calls.map(c => c.cursor), [null, 'next', null]);
    assert.ok(logs.some(line => /activity: complete in/.test(line)));
});
test('activity bounds concurrency to four repositories and rechecks privacy, archives and forks', async () => {
    let active = 0, maximum = 0;
    const repositories = Array.from({ length: 7 }, (_, i) => ({ name: `R${i}` }));
    const github = { graphql: async (query, { name }) => {
        maximum = Math.max(maximum, ++active);
        await new Promise(resolve => setImmediate(resolve));
        active--;
        const changed = name === 'R0' ? { isPrivate: true } : name === 'R1' ? { isArchived: true } : name === 'R2' ? { isFork: true } : {};
        // Change after PR collection as well: that repo's earlier records must be discarded.
        const connection = query.includes('pullRequests(') ? 'pullRequests' : 'issues';
        return { repository: { ...meta, ...(connection === 'issues' ? changed : {}), [connection]: page(connection === 'pullRequests' ? [pr(name, '2026-10-20T00:00:00Z')] : []) } };
    } };
    const records = await collectActivity(github, 'Cratis', repositories, activityStart(now), now, quiet);
    assert.equal(maximum, 4);
    assert.deepEqual(records.pullRequests.map(p => p.author.login).sort(), ['R3', 'R4', 'R5', 'R6']);
    assert.equal(repositories.filter(r => r.excluded).length, 3);
});
test('local records reproduce every rolling, weekly, monthly and exact digest window', () => {
    for (const current of [now, '2024-03-01T00:00:00.000Z', '2027-01-01T04:00:00.000Z']) {
        const w = windows(current), since = new Date(Date.parse(current) - 7 * 86400000).toISOString();
        const dates = Array.from({ length: 420 }, (_, i) => new Date(Date.parse(current.slice(0, 10)) - i * 86400000).toISOString());
        dates.push(current, since, w.since(7), w.since(30), w.since(365));
        const prs = dates.map(mergedAt => ({ mergedAt }));
        const issues = dates.map(createdAt => ({ createdAt, closedAt: createdAt })).concat([{ createdAt: current, closedAt: null }]);
        const counts = collectCounts(current, since, prs, issues);
        for (const window of countWindows(current, since)) {
            assert.equal(counts[window.key], dates.filter(d => d >= window.start && d < window.end).length, `${current}: ${window.key}`);
        }
        assert.ok(activityStart(current, since) <= w.since(365));
        assert.ok(activityStart(current, since) <= new Date(w.weekly[0].start).toISOString());
    }
    assert.equal(activityStart(now, '2025-01-01T04:12:00.000Z'), '2025-01-01T00:00:00.000Z');
    assert.deepEqual(collectCounts(now, undefined, [], []).pr365, 0);
});
test('first-timer logic uses fetched history before one date-only org search per remaining non-bot author', async () => {
    const since = '2026-07-24T04:00:00.000Z', seen = [];
    const result = await firstTimeContributors(async queries => {
        seen.push(...queries);
        assert.deepEqual(queries.map(q => q.query), [
            'org:Cratis is:pr is:merged author:new merged:<2026-07-24',
            'org:Cratis is:pr is:merged author:older-history merged:<2026-07-24'
        ]);
        return { a0: { issueCount: 0 }, a1: { issueCount: 5 } };
    }, 'Cratis', [pr('new', '2026-10-20T00:00:00Z'), pr('new', '2026-09-01T00:00:00Z'),
        pr('known', '2026-10-20T00:00:00Z'), pr('known', '2026-01-01T00:00:00Z'),
        pr('same-day', '2026-07-24T01:00:00Z'), pr('same-day', '2026-10-20T00:00:00Z'),
        pr('older-history', '2026-10-20T00:00:00Z'),
        ...['dependabot[bot]', 'renovate', 'Copilot', 'copilot-swe-agent', 'cratis-bot', null].map(login => pr(login, '2026-10-20T00:00:00Z')),
        pr('machine', '2026-10-20T00:00:00Z', { author: { login: 'machine', __typename: 'Bot' } })], since);
    assert.equal(seen.length, 2);
    assert.equal(result.length, 1);
    assert.equal(result[0].login, 'new');
    assert.equal(result[0].firstMergedAt, '2026-09-01T00:00:00Z');
    assert.equal(result[0].pullRequestTitle, 'Contribution');
});
test('history search is count-only, sequential and paced with one request per author', async () => {
    const requests = [], delays = [];
    const search = searchClient({ graphql: async query => {
        requests.push(query);
        assert.match(query, /first: 1\) \{ issueCount \}/);
        assert.doesNotMatch(query, /nodes|repo:|T00:/);
        return { search: { issueCount: requests.length } };
    } }, async ms => delays.push(ms), quiet);
    const result = await search([{ key: 'a0', query: 'org:Cratis is:pr is:merged author:a merged:<2026-07-24' },
        { key: 'a1', query: 'org:Cratis is:pr is:merged author:b merged:<2026-07-24' }]);
    assert.deepEqual(result, { a0: { issueCount: 1 }, a1: { issueCount: 2 } });
    assert.deepEqual(delays, [2100]);
    await search([]);
    assert.equal(requests.length, 2);
});
test('complete collector derives counts, bot split, newcomer details and digest without bulk search or hydration', async () => {
    const messages = [], mergedAt = '2026-10-20T12:00:00.000Z';
    let searches = 0;
    const github = { graphql: async (query, variables) => {
        if (query.includes('organization(login:')) return { organization: { repositories: page([{ name: 'Widget', url: 'https://github.com/Cratis/Widget', ...meta }]) } };
        if (query.includes('r0: repository')) return { r0: { ...meta, releases: page([]) } };
        if (query.includes('pullRequests(')) return { repository: { ...meta, pullRequests: page([pr('new', mergedAt), pr('dependabot[bot]', mergedAt),
            pr('known', mergedAt), pr('known', '2026-01-01T00:00:00Z')]) } };
        if (query.includes('issues(')) return { repository: { ...meta, issues: page([{ createdAt: mergedAt, closedAt: mergedAt, updatedAt: mergedAt },
            { createdAt: mergedAt, closedAt: null, updatedAt: mergedAt }]) } };
        assert.equal(variables, undefined);
        assert.match(query, /org:Cratis is:pr is:merged author:new merged:<2026-07-24/);
        searches++;
        return { search: { issueCount: 0 } };
    } };
    const result = await collectOrgStats({ github, now, digestSince: '2026-10-14T04:00:00Z', ...quiet, progress: line => messages.push(line) });
    assert.equal(searches, 1);
    assert.equal(result.snapshot.contributors.activeLast30Days, 2);
    assert.equal(result.snapshot.contributors.firstTime[0].name, 'new');
    assert.equal(result.snapshot.mergedPullRequests.last7Days, 3);
    assert.equal(result.snapshot.mergedPullRequests.last365Days, 4);
    assert.equal(result.snapshot.mergedPullRequests.dependencyUpdatesLast7Days, 1);
    assert.equal(result.snapshot.issues.openedLast7Days, 2);
    assert.equal(result.snapshot.issues.closedLast7Days, 1);
    assert.equal(result.numbers.mergedPullRequests, 3);
    assert.equal(result.numbers.issuesClosed, 1);
    for (const phase of ['repos', 'releases', 'activity', 'contributors', 'counts', 'aggregation']) assert.ok(messages.some(line => line.startsWith(`${phase}: complete in`)));
    require('./org-stats-schema.test.cjs').validateSnapshot(result.snapshot);
});
