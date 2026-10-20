// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { windows, aggregate, prepareReleases, streaks, isBot, weekNumbers } = require('./org-stats.cjs');
const { wait, progressLogger, retryGraphql } = require('./org-stats-client.cjs');
const publicRepository = r => r && r.isPrivate === false && r.isArchived === false && r.isFork === false;
const actorFields = '__typename login avatarUrl url ... on User { name }';
const prFields = 'id mergedAt author { __typename login }';
const prDetails = `mergedAt title url repository { name } author { ${actorFields} }`;

// At most 29 search requests/minute. Count-only batches have no result nodes;
// node batches are deliberately small to avoid expensive nested GraphQL queries.
// Explicit repository qualifiers prevent private, archived and fork data entering counts.
function searchClient(github, pause = wait, { progress = progressLogger(), clock = Date.now } = {}) {
    let last = null;
    return async (queries, label = 'counts') => {
        const result = {};
        progress(`search ${label}: 0/${queries.length}`);
        for (let offset = 0; offset < queries.length;) {
            const batch = queries.slice(offset, offset + (queries[offset].nodes ? 3 : 15));
            const delay = last === null ? 0 : 2100 - (clock() - last);
            if (delay > 0) await pause(delay);
            const query = batch.map((q, i) => `s${i}: search(type: ISSUE, query: ${JSON.stringify(q.query)}, first: ${q.nodes ? 100 : 1}${q.after ? `, after: ${JSON.stringify(q.after)}` : ''}) { issueCount ${q.nodes ? `pageInfo { hasNextPage endCursor } nodes { ... on PullRequest { ${prFields} } }` : ''} }`).join('\n');
            const response = await retryGraphql(github, `query { ${query} }`, undefined, { pause, progress, clock });
            // Pace from completion so retries cannot consume the next request's slot.
            last = clock();
            batch.forEach((q, i) => { result[q.key] = response[`s${i}`]; });
            offset += batch.length;
            progress(`search ${label}: ${offset}/${queries.length}`);
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
function countQueries(scope, now, digestSince) {
    const w = windows(now);
    const queries = [];
    function add(key, filter, start, end = w.end) {
        // GitHub range upper bounds are inclusive; use <end as a separate qualifier.
        const since = new Date(start.date).toISOString(), until = new Date(end).toISOString();
        queries.push({ key, field: start.field, filter, start: since, end: until,
            query: `${scope} ${filter} ${start.field}:>=${since} ${start.field}:<${until}` });
    }
    for (const n of [7, 30, 365]) {
        add(`pr${n}`, 'is:pr is:merged', { field: 'merged', date: w.since(n) });
        add(`close${n}`, 'is:issue is:closed', { field: 'closed', date: w.since(n) });
    }
    add('open7', 'is:issue', { field: 'created', date: w.since(7) });
    w.weekly.forEach((window, i) => {
        add(`wpr${i}`, 'is:pr is:merged', { field: 'merged', date: window.start }, window.end);
        add(`wclose${i}`, 'is:issue is:closed', { field: 'closed', date: window.start }, window.end);
    });
    w.monthly.forEach((window, i) => {
        add(`mpr${i}`, 'is:pr is:merged', { field: 'merged', date: window.start }, window.end);
        add(`mclose${i}`, 'is:issue is:closed', { field: 'closed', date: window.start }, window.end);
        add(`mopen${i}`, 'is:issue', { field: 'created', date: window.start }, window.end);
    });
    if (digestSince) {
        add('digestPr', 'is:pr is:merged', { field: 'merged', date: digestSince });
        add('digestClose', 'is:issue is:closed', { field: 'closed', date: digestSince });
    }
    return queries;
}
// Count disjoint intervals once, then sum them into weekly/monthly/rolling windows.
// Recent PRs are already fetched for contributors: never search their counts again.
async function collectCounts(search, scope, now, digestSince, pullRequests, contributorSince) {
    const desired = countQueries(scope, now, digestSince), segments = [];
    for (const field of ['merged', 'closed', 'created']) {
        const group = desired.filter(q => q.field === field);
        const boundaries = [...new Set(group.flatMap(q => [q.start, q.end]).concat(field === 'merged' ? [contributorSince] : []))].sort();
        for (let i = 0; i < boundaries.length - 1; i++) {
            const start = boundaries[i], end = boundaries[i + 1];
            if (!group.some(q => q.start <= start && q.end >= end)) continue;
            const local = field === 'merged' && start >= contributorSince;
            segments.push({ key: `c${segments.length}`, field, start, end, local,
                count: local ? pullRequests.filter(pr => pr.mergedAt >= start && pr.mergedAt < end).length : undefined,
                query: `${scope} ${group[0].filter} ${field}:>=${start} ${field}:<${end}` });
        }
    }
    const raw = await search(segments.filter(s => !s.local));
    return Object.fromEntries(desired.map(q => [q.key, segments.filter(s => s.field === q.field && s.start >= q.start && s.end <= q.end)
        .reduce((total, s) => total + (s.local ? s.count : raw[s.key].issueCount), 0)]));
}
// Split busy search intervals before pagination hits GitHub's 1,000-result cap.
async function mergedInWindow(search, scope, since, until, progress = progressLogger()) {
    let sequence = 0;
    const interval = (start, end, after) => ({ key: `p${sequence++}`, start, end, after, nodes: true,
        query: `${scope} is:pr is:merged merged:>=${start} merged:<${end}` });
    const pending = [];
    // Independent weekly partitions let pagination share paced request batches.
    for (let start = Date.parse(since); start < Date.parse(until); start += 7 * 86400000) {
        pending.push(interval(new Date(start).toISOString(), new Date(Math.min(start + 7 * 86400000, Date.parse(until))).toISOString()));
    }
    const nodes = [];
    while (pending.length) {
        const batch = pending.splice(0, 15);
        const pages = await search(batch, 'merged pull requests');
        for (const item of batch) {
            const page = pages[item.key];
            if (page.issueCount > 1000) {
                const midpoint = new Date(Math.floor((Date.parse(item.start) + Date.parse(item.end)) / 2000) * 1000).toISOString();
                if (midpoint <= item.start || midpoint >= item.end) throw new Error('Too many merged pull requests within one second');
                pending.push(interval(item.start, midpoint), interval(midpoint, item.end));
            } else {
                nodes.push(...page.nodes);
                if (page.pageInfo.hasNextPage) pending.push(interval(item.start, item.end, page.pageInfo.endCursor));
            }
        }
        progress(`contributors: ${nodes.length} merged pull requests, ${pending.length} pages pending`);
    }
    return nodes;
}
async function firstTimeContributors(search, scope, pullRequests, since, hydrate = async prs => prs) {
    const earliest = new Map();
    for (const pr of pullRequests) {
        if (!isBot(pr.author) && (!earliest.has(pr.author.login) || earliest.get(pr.author.login).mergedAt > pr.mergedAt)) earliest.set(pr.author.login, pr);
    }
    const candidates = [...earliest.values()];
    // created-asc alone cannot establish the earliest merge (an old PR may merge later).
    // The pre-window count plus the minimum mergedAt in the complete window does.
    const prior = await search(candidates.map((pr, i) => ({ key: `a${i}`, query: `${scope} is:pr is:merged author:${pr.author.login} merged:<${since} sort:created-asc` })), 'contributor history');
    const newcomers = await hydrate(candidates.filter((_, i) => prior[`a${i}`].issueCount === 0));
    return newcomers.map(pr => ({
        login: pr.author.login, name: pr.author.name || pr.author.login, avatarUrl: pr.author.avatarUrl,
        profileUrl: pr.author.url, firstMergedAt: pr.mergedAt, repository: pr.repository.name,
        pullRequestUrl: pr.url, pullRequestTitle: pr.title
    })).sort((a, b) => b.firstMergedAt.localeCompare(a.firstMergedAt) || a.login.localeCompare(b.login));
}
async function collectOrgStats({ github, org = 'Cratis', now = new Date(), digestSince, pause = wait, progress = progressLogger(), clock = Date.now }) {
    const repositories = await collectRepositories(github, org, { pause, progress, clock });
    const w = windows(now);
    const scope = repositories.map(r => `repo:${org}/${r.name}`).join(' ');
    if (!repositories.length) throw new Error('No eligible public repositories found');
    const search = searchClient(github, pause, { progress, clock });
    const contributorSince = new Date(digestSince && digestSince < w.since(90) ? digestSince : w.since(90)).toISOString();
    let started = clock();
    progress('contributors: starting');
    const pullRequests = await mergedInWindow(search, scope, contributorSince, w.end, progress);
    const contributors = await firstTimeContributors(search, scope, pullRequests, contributorSince, async prs => {
        const details = [];
        for (let offset = 0; offset < prs.length; offset += 100) {
            const response = await retryGraphql(github, `query($ids: [ID!]!) { nodes(ids: $ids) { ... on PullRequest { ${prDetails} } } }`,
                { ids: prs.slice(offset, offset + 100).map(pr => pr.id) }, { pause, progress, clock });
            if (response.nodes.some(pr => !pr?.author)) throw new Error('First-time contributor pull request is unavailable');
            details.push(...response.nodes);
        }
        return details;
    });
    progress(`contributors: complete in ${((clock() - started) / 1000).toFixed(1)}s`);
    started = clock();
    progress('counts: starting');
    const counts = await collectCounts(search, scope, now, digestSince, pullRequests, contributorSince);
    progress(`counts: complete in ${((clock() - started) / 1000).toFixed(1)}s`);
    started = clock();
    const snapshot = aggregate({ org, now, repositories, counts, contributors: contributors.filter(c => c.firstMergedAt >= w.since(90)), pullRequests });
    const releases = prepareReleases(repositories, w.end);
    const numbers = digestSince ? weekNumbers({ releases, counts, contributors, streak: streaks(releases, w.today), since: digestSince, until: w.end }) : null;
    progress(`aggregation: complete in ${((clock() - started) / 1000).toFixed(1)}s`);
    return { snapshot, numbers };
}
module.exports = { publicRepository, searchClient, collectRepositories, countQueries, collectCounts, mergedInWindow, firstTimeContributors, collectOrgStats };
