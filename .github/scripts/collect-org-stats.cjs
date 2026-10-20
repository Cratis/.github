// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { windows, aggregate, prepareReleases, streaks, isBot, weekNumbers } = require('./org-stats.cjs');
const { wait, progressLogger, retryGraphql } = require('./org-stats-client.cjs');
const publicRepository = r => r && r.isPrivate === false && r.isArchived === false && r.isFork === false;
const { collectActivity, countWindows, collectCounts, activityStart } = require('./org-stats-activity.cjs');

// Only newcomer history uses search: one count-only, org-scoped query per author.
function searchClient(github, pause = wait, { progress = progressLogger(), clock = Date.now } = {}) {
    let last = null;
    return async (queries, label = 'contributor history') => {
        const result = {};
        progress(`search ${label}: 0/${queries.length}`);
        for (const [index, item] of queries.entries()) {
            const delay = last === null ? 0 : 2100 - (clock() - last);
            if (delay > 0) await pause(delay);
            const response = await retryGraphql(github, `query { search(type: ISSUE, query: ${JSON.stringify(item.query)}, first: 1) { issueCount } }`, undefined, { pause, progress, clock });
            last = clock();
            result[item.key] = response.search;
            progress(`search ${label}: ${index + 1}/${queries.length}`);
        }
        return result;
    };
}
async function collectRepositories(github, org, { progress = progressLogger(), pause = wait, clock = Date.now } = {}) {
    const request = (query, variables) => retryGraphql(github, query, variables, { progress, pause, clock });
    const result = [];
    let cursor = null, pageNumber = 0, started = clock();
    progress('repos: starting');
    do {
        const response = await request(`query($org: String!, $cursor: String) {
            organization(login: $org) { repositories(first: 100, after: $cursor, privacy: PUBLIC, orderBy: { field: NAME, direction: ASC }) {
                nodes { name url isPrivate isArchived isFork } pageInfo { hasNextPage endCursor }
            } }
        }`, { org, cursor });
        const page = response.organization.repositories;
        result.push(...page.nodes.filter(publicRepository).map(r => ({ ...r, releases: [] })));
        cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
        progress(`repos: page ${++pageNumber}, ${result.length} eligible`);
    } while (cursor);
    progress(`repos: complete in ${((clock() - started) / 1000).toFixed(1)}s`);
    // Page every release, not a moving cumulative counter: deletions/backfills remain correct.
    // Limit each query to 100 release nodes rather than 800; three independent
    // requests in flight keep small pages from serializing the entire history.
    started = clock();
    progress('releases: starting');
    let pending = result.map(repository => ({ repository, cursor: null, page: 1 }));
    while (pending.length) {
        const batches = [];
        while (pending.length && batches.length < 3) batches.push(pending.splice(0, 2));
        const next = await Promise.all(batches.map(async batch => {
            const fields = batch.map(({ repository, cursor }, i) => `r${i}: repository(owner: ${JSON.stringify(org)}, name: ${JSON.stringify(repository.name)}) {
                isPrivate isArchived isFork releases(first: 50${cursor ? `, after: ${JSON.stringify(cursor)}` : ''}) {
                    nodes { tagName url publishedAt isDraft isPrerelease } pageInfo { hasNextPage endCursor }
                }
            }`).join('\n');
            const response = await request(`query { ${fields} }`);
            const following = [];
            batch.forEach(({ repository, page }, i) => {
                const current = response[`r${i}`];
                if (!publicRepository(current)) { repository.excluded = true; repository.releases = []; return; }
                repository.releases.push(...current.releases.nodes);
                progress(`releases: ${repository.name} page ${page}, +${current.releases.nodes.length} (${repository.releases.length} total)`);
                if (current.releases.pageInfo.hasNextPage) following.push({ repository, page: page + 1, cursor: current.releases.pageInfo.endCursor });
            });
            return following;
        }));
        pending.push(...next.flat());
    }
    progress(`releases: complete in ${((clock() - started) / 1000).toFixed(1)}s`);
    return result.filter(r => !r.excluded);
}
async function firstTimeContributors(search, org, pullRequests, since) {
    const earliest = new Map();
    for (const pr of pullRequests) {
        if (!isBot(pr.author) && (!earliest.has(pr.author.login) || earliest.get(pr.author.login).mergedAt > pr.mergedAt)) earliest.set(pr.author.login, pr);
    }
    // Known earlier merges rule out established authors without a search.
    const candidates = [...earliest.values()].filter(pr => pr.mergedAt >= since);
    // A date-only cutoff is reliable in search. Any earlier merge on the cutoff
    // day is already present in the fetched history, including exact digest times.
    const prior = await search(candidates.map((pr, i) => ({ key: `a${i}`, query: `org:${org} is:pr is:merged author:${pr.author.login} merged:<${since.slice(0, 10)}` })), 'contributor history');
    const newcomers = candidates.filter((_, i) => prior[`a${i}`].issueCount === 0);
    return newcomers.map(pr => ({
        login: pr.author.login, name: pr.author.name || pr.author.login, avatarUrl: pr.author.avatarUrl,
        profileUrl: pr.author.url, firstMergedAt: pr.mergedAt, repository: pr.repository.name,
        pullRequestUrl: pr.url, pullRequestTitle: pr.title
    })).sort((a, b) => b.firstMergedAt.localeCompare(a.firstMergedAt) || a.login.localeCompare(b.login));
}
async function collectOrgStats({ github, org = 'Cratis', now = new Date(), digestSince, pause = wait, progress = progressLogger(), clock = Date.now }) {
    const repositories = await collectRepositories(github, org, { pause, progress, clock });
    const w = windows(now);
    if (!repositories.length) throw new Error('No eligible public repositories found');
    const search = searchClient(github, pause, { progress, clock });
    const contributorSince = new Date(digestSince && digestSince < w.since(90) ? digestSince : w.since(90)).toISOString();
    const { pullRequests, issues } = await collectActivity(github, org, repositories, activityStart(now, digestSince), w.end, { pause, progress, clock });
    const eligible = repositories.filter(r => !r.excluded);
    let started = clock();
    progress('contributors: starting');
    const contributors = await firstTimeContributors(search, org, pullRequests, contributorSince);
    progress(`contributors: complete in ${((clock() - started) / 1000).toFixed(1)}s`);
    started = clock();
    progress('counts: starting');
    const counts = collectCounts(now, digestSince, pullRequests, issues);
    progress(`counts: complete in ${((clock() - started) / 1000).toFixed(1)}s`);
    started = clock();
    const snapshot = aggregate({ org, now, repositories: eligible, counts, contributors: contributors.filter(c => c.firstMergedAt >= w.since(90)), pullRequests });
    const releases = prepareReleases(eligible, w.end);
    const numbers = digestSince ? weekNumbers({ releases, counts, contributors, streak: streaks(releases, w.today), since: digestSince, until: w.end }) : null;
    progress(`aggregation: complete in ${((clock() - started) / 1000).toFixed(1)}s`);
    return { snapshot, numbers };
}
module.exports = { publicRepository, searchClient, collectRepositories, countWindows, collectCounts, firstTimeContributors, collectOrgStats };
