// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { markdown, plural, kindsText, humanDuration } = require('./render-org-stats.cjs');
const title = numbers => `Cratis Wrapped ${numbers.year}${numbers.partial ? ` (so far, until ${numbers.until.slice(0, 10)})` : ''}`;
function headline(numbers) {
    const split = kindsText(numbers.kinds);
    return [`- **${plural(numbers.releases, 'release')}**${split ? ` (${split})` : ''}.`,
        `- **${plural(numbers.mergedPullRequests, 'merged pull request')}** and **${plural(numbers.issuesClosed, 'issue')} closed**.`,
        `- **${numbers.repositoriesReleased.toLocaleString('en-US')} ${numbers.repositoriesReleased === 1 ? 'repository' : 'repositories'}** released.`].join('\n');
}
function bar(value, maximum) {
    if (!value || !maximum) return '';
    const eighths = Math.max(1, Math.round(value / maximum * 16 * 8));
    return '█'.repeat(Math.floor(eighths / 8)) + ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'][eighths % 8];
}
function monthTable(months) {
    const maximum = Math.max(0, ...months.map(m => m.releases));
    return ['| Month | Releases | Merged PRs | Release activity |', '| --- | ---: | ---: | --- |',
        ...months.map(m => `| ${m.month} | ${m.releases} | ${m.mergedPullRequests} | ${bar(m.releases, maximum)} |`)].join('\n');
}
const repositoryLink = r => `[${markdown(r.name)}](${r.url})`;
const versions = r => `${markdown(r.first)} → ${markdown(r.last)}`;
function deliverySection(leadTime) {
    if (!leadTime) return 'No matching releases and merged pull requests.';
    return [`Based on ${plural(leadTime.matchedReleases, 'matched release')}.`, '',
        ...[['Merge → release', leadTime.mergeToRelease], ['Opened → release', leadTime.openedToRelease]]
            .map(([label, values]) => `- ${label}: median **${humanDuration(values.medianMinutes)}**, 90th percentile **${humanDuration(values.p90Minutes)}**.`)].join('\n');
}
function renderWrapped(numbers) {
    const busiest = numbers.busiestDay, streak = numbers.streak;
    return [`# ${title(numbers)}`, '', headline(numbers), '', '## Month by month', '', monthTable(numbers.months), '',
        '## Top repositories by releases', '',
        ...(numbers.topRepositories.length ? numbers.topRepositories.map(r => `- ${repositoryLink(r)} ${versions(r)} — ${plural(r.releases, 'release')}.`) : ['No releases.']), '',
        '## Biggest version jumps', '',
        ...(numbers.versionJumps.length ? numbers.versionJumps.map(r => `- ${repositoryLink(r)} ${versions(r)} — +${r.major} major, ${r.minor >= 0 ? '+' : ''}${r.minor} minor.`) : ['No increasing stable versions.']), '',
        '## Busiest day and longest release streak', '',
        busiest ? `- Busiest day: **${busiest.date}**, ${plural(busiest.count, 'release')} — ${busiest.repositories.map(r => `${markdown(r.name)} (${r.releases})`).join(', ')}.` : '- Busiest day: none.',
        streak.days ? `- Longest daily release streak inside the year: **${plural(streak.days, 'day')}**, ${streak.start}–${streak.end}.` : '- Longest daily release streak inside the year: 0 days.', '',
        '## Delivery lead time', '', deliverySection(numbers.deliveryLeadTime), '',
        ...(numbers.firstTime.length ? ['## First-time contributors', '', ...numbers.firstTime.map(c => `- [@${markdown(c.login)}](${c.profileUrl}) — first merged PR: [${markdown(c.pullRequestTitle)}](${c.pullRequestUrl}) (${c.firstMergedAt.slice(0, 10)}).`), ''] : []),
        '## Milestones reached', '',
        ...(numbers.milestones.length ? numbers.milestones.map(m => `- ${markdown(m.label)} (${m.reachedOn}).`) : ['No new milestones.']), ''].join('\n');
}
function wrappedDiscord(numbers, digestUrl) {
    return { allowed_mentions: { parse: [] }, embeds: [{ title: title(numbers), url: digestUrl,
        description: headline(numbers), color: 0x248557 }] };
}
module.exports = { title, headline, bar, monthTable, renderWrapped, wrappedDiscord };
