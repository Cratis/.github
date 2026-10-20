// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifyRelease, isBot, prepareReleases, streaks, milestones, windows, aggregate, weekNumbers } = require('./org-stats.cjs');
const { publicRepository, collectRepositories, countWindows, collectOrgStats } = require('./collect-org-stats.cjs');
const { renderCalendar, updateProfile, renderWeekNumbers, weeklyDiscord, milestoneDiscord } = require('./render-org-stats.cjs');
const { meaningfulChange, postDiscord, localGithub } = require('./publish-org-stats.cjs');
const { collectPublicReleases } = require('./collect-public-releases.cjs');
const now = '2026-10-21T04:00:00.000Z';
function release(tagName, publishedAt, extra = {}) { return { tagName, publishedAt, url: `https://github.com/Cratis/Widget/releases/tag/${tagName}`, isDraft: false, ...extra }; }
function fixture() {
    const repositories = [{ name: 'Widget', url: 'https://github.com/Cratis/Widget', releases: [
        release('v1.0.0', '2025-01-01T12:00:00Z'), release('v1.1.0', '2026-10-19T12:00:00Z'),
        release('v1.1.1', '2026-10-20T12:00:00Z'), release('v1.2.0-rc.1', '2026-10-20T13:00:00Z'),
        release('v1.2.0', '2026-10-21T03:00:00Z'), release('v99.0.0', '2026-10-21T06:00:00Z'), release('v100.0.0', '2026-10-19T12:00:00Z', { isDraft: true })
    ] }, { name: 'Empty', url: 'https://github.com/Cratis/Empty', releases: [] }];
    const counts = Object.fromEntries(countWindows(now, '2026-10-14T04:00:00Z').map(q => [q.key, 2]));
    return { org: 'Cratis', now, repositories, counts, contributors: [], pullRequests: [
        { mergedAt: '2026-10-20T13:00:00Z', author: { login: 'human', __typename: 'User' } },
        { mergedAt: '2026-10-20T13:00:00Z', author: { login: 'dependabot[bot]', __typename: 'Bot' } }
    ] };
}
for (const [tag, prior, kind] of [
    ['v2.0.0', 'v1.9.9', 'major'], ['1.2.0', '1.1.8', 'minor'], ['1.2.1', '1.2.0', 'patch'],
    ['1.2.0-rc.1', '1.1.0', 'prerelease'], ['1.2.0', undefined, 'initial'], ['nightly', 'v1.0.0', 'initial'],
    ['1.0.0', '2.0.0', 'initial'], ['1.0.0+build', '1.0.0', 'initial'], ['v1.1.0', 'v1.1.0-rc.1', 'initial']
]) test(`classifies ${tag} after ${prior}`, () => assert.equal(classifyRelease(tag, prior), kind));

test('excludes all defined bot identities and missing authors', () => {
    for (const login of ['x[bot]', 'copilot-swe-agent', 'Copilot', 'cratis-bot', 'dependabot', 'renovate']) assert.ok(isBot({ login }));
    assert.ok(isBot({ login: 'machine', __typename: 'Bot' }));
    assert.ok(isBot(null));
    assert.equal(isBot({ login: 'human', __typename: 'User' }), false);
});
test('aggregates UTC windows, complete ordered time series, release kinds and repository ordering', () => {
    const snapshot = aggregate(fixture());
    assert.equal(snapshot.releases.allTime, 5);
    assert.equal(snapshot.releases.last7Days, 4);
    assert.deepEqual(snapshot.releases.last7DaysByKind, { major: 0, minor: 1, patch: 1, prerelease: 1 });
    assert.deepEqual(snapshot.releases.busiestDay, { date: '2026-10-20', count: 2 });
    assert.deepEqual(snapshot.releases.streak, { currentDays: 3, longestDays: 3, longestEndedOn: '2026-10-21' });
    assert.equal(snapshot.contributors.activeLast30Days, 1);
    assert.equal(snapshot.mergedPullRequests.dependencyUpdatesLast7Days, 1);
    assert.equal(snapshot.daily.length, 365); assert.equal(snapshot.daily[0].date, '2025-10-22');
    assert.equal(snapshot.daily.at(-1).date, '2026-10-21');
    assert.equal(snapshot.weekly.length, 53); assert.equal(snapshot.weekly.at(-1).weekStart, '2026-10-19');
    assert.equal(snapshot.monthly.length, 12); assert.equal(snapshot.monthly[0].month, '2025-11');
    assert.equal(snapshot.repositories.length, 1);
    assert.equal(snapshot.repositories[0].latestRelease.tag, 'v1.2.0');
    assert.equal(prepareReleases(fixture().repositories, now).length, 5);
});
test('streak can end yesterday, resets after a gap, handles ties and empty history', () => {
    const r = ['2026-10-16', '2026-10-17', '2026-10-19', '2026-10-20'].map(d => ({ publishedAt: d + 'T12:00:00Z' }));
    assert.deepEqual(streaks(r, '2026-10-21'), { currentDays: 2, longestDays: 2, longestEndedOn: '2026-10-20' });
    assert.equal(streaks(r, '2026-10-22').currentDays, 0);
    assert.deepEqual(streaks([], '2026-10-21'), { currentDays: 0, longestDays: 0, longestEndedOn: null });
});
test('ISO weeks and leap-day UTC windows', () => {
    const w = windows('2024-03-01T00:00:00Z');
    assert.equal(w.since(7), '2024-02-24T00:00:00.000Z');
    assert.equal(w.weekly.at(-1).start, '2024-02-26');
    assert.equal(w.monthly.at(-1).start, '2024-03-01');
    assert.equal(windows('2027-01-01T04:00:00Z').weekly.at(-1).start, '2026-12-28');
});
test('milestones use actual threshold dates and remember broken historic streaks', () => {
    const releases = Array.from({ length: 1000 }, (_, i) => ({ publishedAt: new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString() }));
    const m = milestones(releases, { currentDays: 0 });
    assert.equal(m.reached.find(x => x.id === 'releases-all-time-1000').reachedOn, '2022-09-26');
    assert.equal(m.reached.find(x => x.id === 'streak-30').reachedOn, '2020-01-30');
    assert.deepEqual(m.next.map(x => x.remaining), [1500, 30]);
});
test('calendar is deterministic, transparent and accessible; profile edits only marker block', () => {
    const snapshot = aggregate(fixture()), svg = renderCalendar(snapshot);
    assert.equal(renderCalendar(snapshot), svg);
    assert.equal((svg.match(/<rect .*<title>/g) || []).length, 365);
    assert.match(svg, /2026-10-20: 2 releases/);
    assert.match(svg, /aria-labelledby="title description"/);
    assert.equal(new Set([...svg.matchAll(/fill="(#[\da-f]+)"/g)].map(m => m[1])).size, 6);
    const before = '# Cratis\n\n**At a glance**\n\nOriginal copy.\n';
    const after = updateProfile(before, snapshot);
    assert.equal(after.replace(/\n<!-- org-stats:start -->[\s\S]*?<!-- org-stats:end -->\n/, ''), before);
    assert.equal(updateProfile(after, snapshot), after);
    assert.match(after, /raw.githubusercontent.com\/Cratis\/.github\/main\/stats\/release-calendar.svg/);
    assert.throws(() => updateProfile('# Missing anchor', snapshot), /anchor missing/);
});
test('week numbers and Discord include kinds, linked contributors, digest link and no mentions', () => {
    const f = fixture(), snapshot = aggregate(f);
    const numbers = weekNumbers({ releases: prepareReleases(f.repositories, now), counts: f.counts,
        contributors: [{ login: 'octo', profileUrl: 'https://github.com/octo', firstMergedAt: '2026-10-20T12:00:00Z' }],
        streak: snapshot.releases.streak, since: '2026-10-14T04:00:00Z', until: now });
    assert.equal(numbers.releases, 4); assert.equal(numbers.busiestRepository.name, 'Widget');
    assert.match(renderWeekNumbers(numbers), /\[@octo\]\(https:\/\/github.com\/octo\)/);
    const payload = weeklyDiscord(numbers, 'https://github.com/Cratis/.github/blob/main/release-digests/week.md');
    assert.match(payload.embeds[0].url, /release-digests\/week.md$/);
    assert.match(payload.embeds[0].description, /1 minor, 1 patch/);
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.equal(milestoneDiscord(snapshot, snapshot), null);
    const changed = structuredClone(snapshot);
    changed.milestones.reached.push({ id: 'streak-30', label: '30-day release streak', reachedOn: '2026-10-21' });
    assert.match(milestoneDiscord(changed, snapshot).embeds[0].description, /30-day release streak/);
});
test('clock-only changes are not published', () => {
    const snapshot = aggregate(fixture());
    assert.equal(meaningfulChange({ ...snapshot, generatedAt: '2026-10-21T06:00:00Z' }, snapshot), false);
    assert.equal(meaningfulChange({ ...snapshot, repositoryCount: 20 }, snapshot), true);
    assert.equal(meaningfulChange(snapshot, null), true);
});
test('Discord missing webhook, network errors and HTTP failures never fail publication', async () => {
    const notices = [], warnings = [];
    const args = { payload: { content: 'test' }, notice: m => notices.push(m), warning: m => warnings.push(m) };
    await postDiscord({ ...args, request: () => assert.fail('No network without webhook') });
    assert.equal(notices.length, 1);
    await postDiscord({ ...args, webhook: 'https://example.invalid', request: async () => { throw new Error('secret must not leak'); } });
    await postDiscord({ ...args, webhook: 'https://example.invalid', request: async () => ({ ok: false, status: 503 }) });
    assert.equal(warnings.length, 2); assert.doesNotMatch(warnings.join(), /secret/);
    await postDiscord({ ...args, webhook: 'https://example.invalid', payload: null, request: () => assert.fail('No network without payload') });
});

test('repository collection excludes private, archived, forks and rechecks current metadata; pages all releases', async () => {
    const seen = [];
    const publicMeta = { isPrivate: false, isArchived: false, isFork: false };
    const github = { graphql: async (query, variables) => {
        seen.push({ query, variables });
        if (variables) return { organization: { repositories: { nodes: [
            { name: 'Widget', url: 'https://github.com/Cratis/Widget', ...publicMeta },
            { name: 'Changed', ...publicMeta }, { name: 'Private', ...publicMeta, isPrivate: true },
            { name: 'Archived', ...publicMeta, isArchived: true }, { name: 'Fork', ...publicMeta, isFork: true }
        ], pageInfo: { hasNextPage: false } } } };
        if (query.includes('"cursor"')) return { r0: { ...publicMeta, releases: { nodes: [release('v1.0.0', '2020-01-01T00:00:00Z')], pageInfo: { hasNextPage: false } } } };
        assert.doesNotMatch(query, /"Private"|"Archived"|"Fork"/);
        return { r0: { ...publicMeta, releases: { nodes: [release('v2.0.0', '2026-10-20T00:00:00Z')], pageInfo: { hasNextPage: true, endCursor: 'cursor' } } },
            r1: { ...publicMeta, isPrivate: true } };
    } };
    const result = await collectRepositories(github, 'Cratis');
    assert.equal(result.length, 1); assert.equal(result[0].releases.length, 2);
    assert.equal(seen.length, 3);
    assert.equal(publicRepository({ isPrivate: false }), false);
    await assert.rejects(collectRepositories({ graphql: async () => { throw new Error('API unavailable'); } }, 'Cratis'), /API unavailable/);
});
test('weekly release collection honors optional end boundary without changing default behavior', async () => {
    const list = Symbol('list'), releases = Symbol('releases');
    const repo = { name: 'Widget', visibility: 'public', private: false, html_url: 'https://github.com/Cratis/Widget' };
    const github = { rest: { repos: { listForOrg: list, listReleases: releases, get: async () => ({ data: repo }) } },
        paginate: async endpoint => endpoint === list ? [repo] : ['2026-10-20T12:00:00Z', now].map(published_at => ({ published_at, tag_name: 'v1.0.0' })) };
    const args = { github, org: 'Cratis', since: new Date('2026-10-19T00:00:00Z') };
    assert.equal((await collectPublicReleases(args)).releases.length, 2);
    assert.equal((await collectPublicReleases({ ...args, until: new Date(now) })).releases.length, 1);
});
test('collection fails closed on absent public repos; local client requires token', async () => {
    await assert.rejects(collectOrgStats({ github: { graphql: async () => ({ organization: { repositories: { nodes: [], pageInfo: { hasNextPage: false } } } }) } }), /No eligible public repositories/);
    assert.throws(() => localGithub(), /GITHUB_TOKEN is required/);
});

module.exports = { fixture };

test('release queries bound cost, retain complete pagination and report phase progress', async () => {
    let active = 0, maximum = 0;
    const logs = [], meta = { isPrivate: false, isArchived: false, isFork: false };
    const github = { graphql: async (query, variables) => {
        if (variables) return { organization: { repositories: { nodes: Array.from({ length: 7 }, (_, i) => ({ name: `R${i}`, ...meta })), pageInfo: { hasNextPage: false } } } };
        assert.match(query, /releases\(first: 50/);
        const aliases = [...query.matchAll(/r(\d+): repository/g)];
        assert.ok(aliases.length <= 2);
        maximum = Math.max(maximum, ++active);
        await new Promise(resolve => setImmediate(resolve));
        active--;
        return Object.fromEntries(aliases.map(m => [`r${m[1]}`, { ...meta, releases: { nodes: [], pageInfo: { hasNextPage: false } } }]));
    } };
    assert.equal((await collectRepositories(github, 'Cratis', { progress: line => logs.push(line) })).length, 7);
    assert.equal(maximum, 3);
    assert.ok(logs.includes('repos: page 1, 7 eligible'));
    assert.ok(logs.some(line => /releases: R6 page 1/.test(line)));
    assert.ok(logs.some(line => /releases: complete in/.test(line)));
});
