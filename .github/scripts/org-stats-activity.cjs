// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { windows } = require('./org-stats.cjs');
const { wait, progressLogger, retryGraphql } = require('./org-stats-client.cjs');
const prFields = 'id number url title mergedAt updatedAt author { __typename login ... on User { name avatarUrl url } } repository { name }';
const issueFields = 'createdAt closedAt updatedAt';
function countWindows(now, digestSince) {
    const w = windows(now), result = [];
    const add = (key, field, start, end = w.end) => result.push({ key, field, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    for (const n of [7, 30, 365]) {
        add(`pr${n}`, 'mergedAt', w.since(n));
        add(`close${n}`, 'closedAt', w.since(n));
    }
    add('open7', 'createdAt', w.since(7));
    w.weekly.forEach((window, i) => {
        add(`wpr${i}`, 'mergedAt', window.start, window.end);
        add(`wclose${i}`, 'closedAt', window.start, window.end);
    });
    w.monthly.forEach((window, i) => {
        add(`mpr${i}`, 'mergedAt', window.start, window.end);
        add(`mclose${i}`, 'closedAt', window.start, window.end);
        add(`mopen${i}`, 'createdAt', window.start, window.end);
    });
    if (digestSince) {
        add('digestPr', 'mergedAt', digestSince);
        add('digestClose', 'closedAt', digestSince);
    }
    return result;
}
function activityStart(now, digestSince) {
    // The first ISO week can precede the 365-day rolling window. Extended
    // digest lookbacks need the entire cutoff day so date-only contributor
    // searches cannot miss an earlier merge on that same day.
    return `${countWindows(now, digestSince).map(w => w.start).sort()[0].slice(0, 10)}T00:00:00.000Z`;
}
function collectCounts(now, digestSince, pullRequests, issues) {
    return Object.fromEntries(countWindows(now, digestSince).map(window => [window.key,
        (window.field === 'mergedAt' ? pullRequests : issues).filter(record =>
            record[window.field] && record[window.field] >= window.start && record[window.field] < window.end).length]));
}
async function collectActivity(github, org, repositories, since, until, { progress = progressLogger(), pause = wait, clock = Date.now } = {}) {
    const started = clock(), records = [];
    let next = 0;
    progress('activity: starting');
    async function pageRepository(repository, connection) {
        const nodes = [];
        let cursor = null, pageNumber = 0;
        do {
            const response = await retryGraphql(github, `query($org: String!, $name: String!, $cursor: String) {
                repository(owner: $org, name: $name) {
                    isPrivate isArchived isFork
                    ${connection}(first: 100, after: $cursor, ${connection === 'pullRequests' ? 'states: MERGED,' : ''} orderBy: { field: UPDATED_AT, direction: DESC }) {
                        nodes { ${connection === 'pullRequests' ? prFields : issueFields} } pageInfo { hasNextPage endCursor }
                    }
                }
            }`, { org, name: repository.name, cursor }, { progress, pause, clock });
            const current = response.repository;
            if (!current || current.isPrivate !== false || current.isArchived !== false || current.isFork !== false) {
                repository.excluded = true;
                return [];
            }
            const page = current[connection];
            nodes.push(...page.nodes.filter(record => connection === 'issues' || record.mergedAt >= since && record.mergedAt < until));
            progress(`activity: ${repository.name} ${connection} page ${++pageNumber}, +${page.nodes.length}`);
            // updatedAt >= mergedAt/createdAt/closedAt: no older page can
            // contain an event in any of the requested windows.
            const pastWindow = page.nodes.some(record => record.updatedAt < since);
            cursor = page.pageInfo.hasNextPage && !pastWindow ? page.pageInfo.endCursor : null;
        } while (cursor);
        return nodes;
    }
    async function worker() {
        while (next < repositories.length) {
            const repository = repositories[next++];
            const pullRequests = await pageRepository(repository, 'pullRequests');
            const issues = repository.excluded ? [] : await pageRepository(repository, 'issues');
            if (!repository.excluded) records.push({ pullRequests, issues });
        }
    }
    await Promise.all(Array.from({ length: Math.min(4, repositories.length) }, worker));
    const pullRequests = records.flatMap(r => r.pullRequests), issues = records.flatMap(r => r.issues);
    progress(`activity: complete in ${((clock() - started) / 1000).toFixed(1)}s (${pullRequests.length} merged pull requests, ${issues.length} issues)`);
    return { pullRequests, issues };
}
module.exports = { countWindows, activityStart, collectCounts, collectActivity };
