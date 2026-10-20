// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { date, shift, monday } = require('./org-stats.cjs');
const escapeXml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const colors = ['#88909633', '#83cfa0', '#45ac78', '#248557', '#17623f'];
function calendarTitle(day) {
    const repositories = day.repositories || [];
    const top = repositories.slice(0, 3).map(r => `${r.name} ${r.releases}`).join(', ');
    const more = repositories.length > 3 ? ` and ${repositories.length - 3} more repositories` : '';
    return `${day.date}: ${day.releases} releases${top ? ` — ${top}${more}` : ''}`;
}
function renderCalendar(snapshot) {
    const today = date(snapshot.generatedAt), start = shift(monday(today), -52 * 7);
    const days = new Map(snapshot.daily.map(d => [d.date, d]));
    const max = Math.max(1, ...snapshot.daily.map(d => d.releases));
    const lines = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 742 136" role="img" aria-labelledby="title description">',
        '<title id="title">Cratis daily releases</title>',
        '<desc id="description">53 weeks of daily releases. Weeks start Monday. Darker green means more releases.</desc>'];
    for (let week = 0; week < 53; week++) {
        for (let weekday = 0; weekday < 7; weekday++) {
            const day = shift(start, week * 7 + weekday);
            if (day > today) continue;
            const entry = days.get(day);
            // The JSON promises 365 days; at most six earlier grid cells have no data.
            if (entry === undefined) continue;
            const count = entry.releases;
            // Logarithmic buckets: a few very busy days must not flatten the rest of the year.
            const bucket = count ? Math.max(1, Math.min(4, Math.ceil(Math.log1p(count) / Math.log1p(max) * 4))) : 0;
            lines.push(`<rect x="${week * 14}" y="${weekday * 14}" width="11" height="11" rx="2" fill="${colors[bucket]}"><title>${escapeXml(calendarTitle(entry))}</title></rect>`);
        }
    }
    lines.push('<g font-family="system-ui, sans-serif" font-size="10" fill="#808080"><text x="0" y="123">Daily releases · UTC · Monday–Sunday</text><text x="577" y="123">Less</text><text x="708" y="123">More</text></g>');
    colors.forEach((color, i) => lines.push(`<rect x="${609 + i * 18}" y="113" width="11" height="11" rx="2" fill="${color}"/>`));
    return lines.join('\n') + '\n</svg>\n';
}
const plural = (count, word) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;
// Name only the kinds that occurred, e.g. "442 minor, 235 patch".
const kindsText = kinds => ['major', 'minor', 'patch', 'prerelease'].filter(kind => kinds[kind] > 0)
    .map(kind => `${kinds[kind].toLocaleString('en-US')} ${kind}`).join(', ');
function renderProfile(snapshot) {
    const r = snapshot.releases, kinds = r.last7DaysByKind;
    return ['<!-- org-stats:start -->',
        `Last 7 days: **${plural(r.last7Days, 'release')}** (${(kinds.major + kinds.minor).toLocaleString('en-US')} of them major or minor), **${plural(snapshot.mergedPullRequests.last7Days, 'merged pull request')}**, **${plural(snapshot.issues.closedLast7Days, 'issue')} closed** · **${r.streak.currentDays}-day** release streak.`,
        ...(snapshot.releasesThisWeek?.length ? ['', `Most releases this week: ${snapshot.releasesThisWeek.slice(0, 3).map(r => {
            const url = snapshot.repositories.find(repository => repository.name === r.name)?.url;
            return `${url ? `[${markdown(r.name)}](${url})` : markdown(r.name)} ${r.releases}`;
        }).join(' · ')}`] : []), '',
        '![Daily releases over the last 53 weeks](https://raw.githubusercontent.com/Cratis/.github/main/stats/release-calendar.svg)', '<!-- org-stats:end -->'].join('\n');
}
function updateProfile(readme, snapshot) {
    const block = renderProfile(snapshot);
    const pattern = /<!-- org-stats:start -->[\s\S]*?<!-- org-stats:end -->/;
    if (pattern.test(readme)) return readme.replace(pattern, () => block);
    const anchor = '**At a glance**\n';
    if (!readme.includes(anchor)) throw new Error('Profile stats insertion anchor missing');
    return readme.replace(anchor, `${anchor}\n${block}\n`);
}
const markdown = text => String(text).replace(/[\\`*_{}\[\]()<>#!|~]/g, '\\$&').replace(/[\r\n]+/g, ' ');
function humanDuration(minutes) {
    if (minutes < 1) return '< 1 minute';
    if (minutes < 60) return plural(Math.floor(minutes), 'minute');
    if (minutes < 1440) return plural(Math.floor(minutes / 60), 'hour');
    return plural(Math.floor(minutes / 1440), 'day');
}
function renderWeekNumbers(numbers) {
    const b = numbers.busiestRepository, leadTime = numbers.deliveryLeadTime?.mergeToRelease;
    return ['## Week in numbers', '',
        `- **${plural(numbers.releases, 'release')}**${numbers.releases ? `: ${kindsText(numbers.kinds)}` : ''}.`,
        `- **${plural(numbers.mergedPullRequests, 'merged pull request')}** and **${plural(numbers.issuesClosed, 'issue')} closed**.`,
        ...(leadTime ? [`- From merge to release: median **${humanDuration(leadTime.medianMinutes)}** (90% within ${humanDuration(leadTime.p90Minutes)}).`] : []),
        `- Busiest repository: ${b ? `[${markdown(b.name)}](${b.url}) (${b.releases} releases)` : 'none'}.`,
        `- Current daily release streak: **${plural(numbers.currentStreak, 'day')}**.`,
        ...(numbers.firstTime.length ? [`- Welcome to our first-time contributors: ${numbers.firstTime.map(c => `[@${markdown(c.login)}](${c.profileUrl})`).join(', ')}! 🎉`] : []), ''].join('\n');
}
function weeklyDiscord(numbers, digestUrl) {
    return { allowed_mentions: { parse: [] }, embeds: [{ title: 'Cratis · Week in numbers', url: digestUrl,
        description: renderWeekNumbers(numbers).replace(/^## Week in numbers\n\n/, '').slice(0, 3900), color: 0x248557 }] };
}
function milestoneDiscord(snapshot, previous) {
    const known = new Set((previous?.milestones?.reached || []).map(m => m.id));
    const reached = snapshot.milestones.reached.filter(m => !known.has(m.id));
    if (!reached.length) return null;
    return { allowed_mentions: { parse: [] }, embeds: [{ title: 'Cratis milestone 🎉',
        description: reached.map(m => `**${m.label}** (${m.reachedOn})`).join('\n').slice(0, 3900),
        url: 'https://github.com/Cratis', color: 0x248557 }] };
}
module.exports = { escapeXml, markdown, plural, kindsText, calendarTitle, humanDuration, renderCalendar, renderProfile, updateProfile, renderWeekNumbers, weeklyDiscord, milestoneDiscord };
