// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const fs = require('node:fs');
const path = require('node:path');
const { collectOrgStats } = require('./collect-org-stats.cjs');
const { renderCalendar, updateProfile, milestoneDiscord } = require('./render-org-stats.cjs');
function readPrevious(root) {
    try { return JSON.parse(fs.readFileSync(path.join(root, 'stats/org-stats.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function meaningfulChange(snapshot, previous) {
    const withoutClock = value => value && Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'generatedAt'));
    return JSON.stringify(withoutClock(snapshot)) !== JSON.stringify(withoutClock(previous));
}
function writeStats(root, snapshot) {
    const previous = readPrevious(root);
    const changed = meaningfulChange(snapshot, previous);
    if (changed) {
        const profile = path.join(root, 'profile/README.md');
        const readme = updateProfile(fs.readFileSync(profile, 'utf8'), snapshot);
        fs.mkdirSync(path.join(root, 'stats'), { recursive: true });
        fs.writeFileSync(path.join(root, 'stats/org-stats.json'), JSON.stringify(snapshot, null, 2) + '\n');
        fs.writeFileSync(path.join(root, 'stats/release-calendar.svg'), renderCalendar(snapshot));
        fs.writeFileSync(profile, readme);
    }
    return { changed, discord: milestoneDiscord(snapshot, previous) };
}
async function postDiscord({ webhook, payload, notice = console.info, warning = console.warn, request = fetch }) {
    if (!webhook) { notice('Discord webhook is not configured; skipping.'); return; }
    if (!payload) return;
    try {
        const response = await request(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
        if (!response.ok) warning(`Discord returned HTTP ${response.status}; publication is unaffected.`);
    } catch { warning('Discord is unreachable; publication is unaffected.'); }
}
// A dependency-free local adapter. Actions uses the octokit supplied by github-script.
function localGithub(token, request = fetch) {
    if (!token) throw new Error('GITHUB_TOKEN is required');
    return { graphql: async (query, variables = {}) => {
        const response = await request('https://api.github.com/graphql', {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Cratis-org-stats' },
            body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) {
            const error = new Error(`GitHub GraphQL returned HTTP ${response.status}`);
            error.status = response.status;
            error.response = { status: response.status, headers: response.headers, data: await response.json().catch(() => ({})) };
            throw error;
        }
        const result = await response.json();
        if (result.errors) {
            const error = new Error(`GitHub GraphQL: ${result.errors.map(e => e.message).join('; ')}`);
            error.errors = result.errors;
            error.headers = response.headers;
            throw error;
        }
        return result.data;
    } };
}
async function main() {
    const started = Date.now();
    const days = Number(process.env.DAYS || 7);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('DAYS must be an integer from 1 to 365');
    const now = new Date();
    const { snapshot, numbers } = await collectOrgStats({ github: localGithub(process.env.GITHUB_TOKEN), now,
        digestSince: new Date(now.getTime() - days * 86400000).toISOString() });
    const result = writeStats(process.cwd(), snapshot);
    if (process.env.ORG_STATS_SAMPLES) {
        const { renderWeekNumbers, weeklyDiscord } = require('./render-org-stats.cjs');
        const directory = process.env.ORG_STATS_SAMPLES;
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, 'week-in-numbers.md'), renderWeekNumbers(numbers));
        fs.writeFileSync(path.join(directory, 'discord-sample.json'), JSON.stringify(weeklyDiscord(numbers, `https://github.com/Cratis/.github/blob/main/release-digests/${new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10)}-to-${now.toISOString().slice(0, 10)}.md`), null, 2) + '\n');
    }
    console.log(JSON.stringify({ changed: result.changed, repositoryCount: snapshot.repositoryCount, releases: snapshot.releases,
        mergedPullRequests: snapshot.mergedPullRequests, issues: snapshot.issues, runtimeSeconds: Number(((Date.now() - started) / 1000).toFixed(1)) }, null, 2));
}
module.exports = { readPrevious, meaningfulChange, writeStats, postDiscord, localGithub };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
