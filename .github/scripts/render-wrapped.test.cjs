// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { yearWindow, wrappedNumbers } = require('./collect-wrapped.cjs');
const { bar, monthTable, headline, renderWrapped, wrappedDiscord } = require('./render-wrapped.cjs');
const { argumentsFor } = require('./publish-wrapped.cjs');
const { postDiscord } = require('./publish-org-stats.cjs');
const empty = () => wrappedNumbers({ window: yearWindow(2024, '2026-08-20T12:00:00.000Z'), releases: [], pullRequests: [], issues: [], contributors: [] });

test('month table scales unicode bars to the busiest month, retaining tiny nonzero months', () => {
    assert.equal(bar(0, 100), '');
    assert.equal(bar(0, 0), '');
    assert.equal(bar(1, 128), '▏');
    assert.equal(bar(7, 128), '▉');
    assert.equal(bar(8, 128), '█');
    assert.equal(bar(128, 128), '████████████████');
    const table = monthTable([{ month: '2024-01', releases: 128, mergedPullRequests: 5 }, { month: '2024-02', releases: 1, mergedPullRequests: 2 }]);
    assert.ok(table.includes('| 2024-01 | 128 | 5 | ████████████████ |'));
    assert.ok(table.includes('| 2024-02 | 1 | 2 | ▏ |'));
});
test('empty rendering omits contributors and zero kinds, but retains all required sections', () => {
    const rendered = renderWrapped(empty());
    assert.ok(rendered.startsWith('# Cratis Wrapped 2024\n'));
    for (const section of ['Month by month', 'Top repositories by releases', 'Biggest version jumps', 'Busiest day and longest release streak', 'Delivery lead time', 'Milestones reached']) assert.ok(rendered.includes(`## ${section}`));
    assert.ok(rendered.includes('**0 repositories** released.'));
    assert.doesNotMatch(rendered, /First-time contributors|0 major|0 minor|0 patch|0 prerelease/);
    assert.ok(rendered.endsWith('\n'));
});
test('rendering escapes GitHub text and includes versions, durations, contributors and milestones', () => {
    const numbers = { ...empty(), ...yearWindow(2026, '2026-08-20T12:00:00.000Z'), releases: 1, kinds: { major: 1, minor: 0, patch: 0, prerelease: 0 },
        repositoriesReleased: 1, topRepositories: [{ name: 'A*[B]|\n', url: 'https://github.com/Cratis/A', first: 'v1_*', last: 'v2|', releases: 1 }],
        versionJumps: [{ name: 'A*', url: 'https://github.com/Cratis/A', first: 'v1', last: 'v2', major: 1, minor: -1 }],
        busiestDay: { date: '2026-01-02', count: 1, repositories: [{ name: 'A*', releases: 1 }] },
        streak: { days: 2, start: '2026-01-01', end: '2026-01-02' },
        deliveryLeadTime: { matchedReleases: 1, mergeToRelease: { medianMinutes: 10, p90Minutes: 120 }, openedToRelease: { medianMinutes: 1440, p90Minutes: 2880 } },
        firstTime: [{ login: 'new*', profileUrl: 'https://github.com/new', pullRequestTitle: '<script>|[link]\nnew', pullRequestUrl: 'https://github.com/Cratis/A/pull/1', firstMergedAt: '2026-01-01T00:00:00.000Z' }],
        milestones: [{ label: '1,000 releases*', reachedOn: '2026-01-02' }] };
    const rendered = renderWrapped(numbers);
    assert.ok(rendered.startsWith('# Cratis Wrapped 2026 (so far, until 2026-08-20)\n'));
    assert.ok(rendered.includes('**1 release** (1 major)'));
    assert.ok(rendered.includes('**1 repository** released.'));
    assert.ok(rendered.includes('[A\\*\\[B\\]\\| ](https://github.com/Cratis/A) v1\\_\\* → v2\\|'));
    assert.ok(rendered.includes('median **10 minutes**, 90th percentile **2 hours**'));
    assert.ok(rendered.includes('Opened → release: median **1 day**, 90th percentile **2 days**'));
    assert.ok(rendered.includes('[@new\\*](https://github.com/new)'));
    assert.ok(rendered.includes('\\<script\\>\\|\\[link\\] new'));
    assert.ok(rendered.includes('1,000 releases\\*'));
});
test('Discord uses one headline-only embed linking to the committed file, with mentions disabled', () => {
    const numbers = empty(), url = 'https://github.com/Cratis/.github/blob/main/release-digests/wrapped-2024.md';
    assert.deepEqual(wrappedDiscord(numbers, url), { allowed_mentions: { parse: [] }, embeds: [{ title: 'Cratis Wrapped 2024', url,
        description: headline(numbers), color: 0x248557 }] });
});
test('reused Discord publisher does not fail on HTTP or network errors; missing webhook is silent with the workflow guard', async () => {
    const warnings = [];
    for (const request of [async () => ({ ok: false, status: 429 }), async () => { throw new Error('offline'); }]) {
        await postDiscord({ webhook: 'https://example.test/webhook', payload: wrappedDiscord(empty(), 'https://example.test/recap'), request, warning: message => warnings.push(message) });
    }
    assert.equal(warnings.length, 2);
    await postDiscord({ webhook: '', payload: {}, notice: () => {}, request: () => assert.fail('must not request') });
});
test('local runner only accepts year and output arguments', () => {
    assert.deepEqual(argumentsFor(['--year', '2026', '--out', '.ai-work/preview.md']), { year: '2026', out: '.ai-work/preview.md' });
    assert.deepEqual(argumentsFor([]), {});
    for (const args of [['--publish'], ['--year'], ['--year', '--out']]) assert.throws(() => argumentsFor(args), /Usage:/);
});
