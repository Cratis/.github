// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

// Both metadata fields must explicitly agree. Missing/unknown visibility is not public.
function isPublic(repository) {
    return repository?.visibility === 'public' && repository.private === false;
}

function isUnconfirmedUrl(url, org, publicRepositories) {
    const target = new URL(url.replace(/[.,;:!?]+$/, ''));
    const [owner, repository] = target.pathname.slice(1).split('/');
    if (owner.toLowerCase() !== org.toLowerCase()) return false;
    try {
        return !publicRepositories.has(decodeURIComponent(repository).toLowerCase());
    } catch {
        return true;
    }
}

function sanitizeBody(body, org, publicRepositories) {
    const githubUrl = String.raw`https?:\/\/github\.com\/[^\s<>()\x60"'\]]+(?:\([^\s<>()\x60]*\)[^\s<>()\x60"'\]]*)*`;
    const markdownLink = new RegExp(String.raw`!?\[([^\]\n]*)\]\(\s*<?(${githubUrl})>?(?:[ \t]+["'][^\n]*?["'])?\s*\)`, 'gi');
    const autolinkOrUrl = new RegExp(String.raw`<(${githubUrl})>|(${githubUrl})`, 'gi');
    return body.split('\n').map(line => {
        const sanitized = line
            .replace(markdownLink, (link, text, url) => isUnconfirmedUrl(url, org, publicRepositories) ? text : link)
            .replace(autolinkOrUrl, (link, autolink, url) => isUnconfirmedUrl(autolink || url, org, publicRepositories) ? 'an internal resource' + (url?.match(/[.,;:!?]+$/)?.[0] || '') : link)
            .replace(/`?([a-z0-9_.-]+)\/([a-z0-9_.-]+)#\d+\b`?/gi, (reference, owner, repository) =>
                owner.toLowerCase() === org.toLowerCase() && !publicRepositories.has(repository.toLowerCase()) ? '' : reference);
        if (sanitized === line) return line;
        return sanitized.replace(/[ \t]*\([ \t,;]*\)/g, '').replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ').replace(/[ \t]+([,.;:!?])/g, '$1').trimEnd();
    }).join('\n');
}

// Collect only public releases using the repository-scoped workflow token. Listing
// is not authorization: recheck current metadata before requesting release bodies.
// Metadata/API failures propagate, stopping the workflow before summary/publication.
async function collectPublicReleases({ github, org, since, until }) {
    const repositories = await github.paginate(github.rest.repos.listForOrg, {
        org,
        type: 'public',
        per_page: 100
    });
    const releases = [];
    const versionMovements = [];
    const publicRepositories = new Set();

    for (const repository of repositories) {
        if (!isPublic(repository)) continue;
        const { data: currentRepository } = await github.rest.repos.get({ owner: org, repo: repository.name });
        if (!isPublic(currentRepository)) continue;
        publicRepositories.add(repository.name.toLowerCase());

        const repositoryReleases = await github.paginate(github.rest.repos.listReleases, {
            owner: org,
            repo: repository.name,
            per_page: 100
        });
        const publishedReleases = repositoryReleases
            .filter(release => !release.draft && release.published_at && (!until || new Date(release.published_at) < until))
            .sort((left, right) => new Date(right.published_at) - new Date(left.published_at));
        const weeklyReleases = publishedReleases.filter(release => new Date(release.published_at) >= since);

        if (weeklyReleases.length) {
            const currentRelease = weeklyReleases[0];
            const previousRelease = publishedReleases.find(release => new Date(release.published_at) < since);
            versionMovements.push({
                repository: repository.name,
                repositoryUrl: currentRepository.html_url,
                previous: previousRelease && {
                    tag: previousRelease.tag_name,
                    url: previousRelease.html_url
                },
                current: {
                    tag: currentRelease.tag_name,
                    url: currentRelease.html_url
                }
            });
        }

        for (const release of weeklyReleases) {
            releases.push({
                repository: repository.name,
                title: release.name || release.tag_name,
                tag: release.tag_name,
                publishedAt: release.published_at,
                url: release.html_url,
                // Pull request descriptions are published verbatim, so template guidance left in an HTML comment
                // reaches the release body; the release page hides it, and so does the digest.
                body: (release.body || '').replace(/<!--[\s\S]*?-->[ \t]*/g, '')
            });
        }
    }

    // Wait until all candidates have been rechecked, including repositories listed later.
    for (const release of releases) {
        release.body = sanitizeBody(release.body, org, publicRepositories).trim().slice(0, 3000);
    }
    releases.sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
    versionMovements.sort((left, right) => left.repository.localeCompare(right.repository));
    return { releases, versionMovements };
}

module.exports = { collectPublicReleases };
