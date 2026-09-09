// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

// Both metadata fields must explicitly agree. Missing/unknown visibility is not public.
function isPublic(repository) {
    return repository?.visibility === 'public' && repository.private === false;
}

// Collect only public releases using the repository-scoped workflow token. Listing
// is not authorization: recheck current metadata before requesting release bodies.
// Metadata/API failures propagate, stopping the workflow before summary/publication.
async function collectPublicReleases({ github, org, since }) {
    const repositories = await github.paginate(github.rest.repos.listForOrg, {
        org,
        type: 'public',
        per_page: 100
    });
    const releases = [];
    const versionMovements = [];

    for (const repository of repositories) {
        if (!isPublic(repository)) continue;
        const { data: currentRepository } = await github.rest.repos.get({ owner: org, repo: repository.name });
        if (!isPublic(currentRepository)) continue;

        const repositoryReleases = await github.paginate(github.rest.repos.listReleases, {
            owner: org,
            repo: repository.name,
            per_page: 100
        });
        const publishedReleases = repositoryReleases
            .filter(release => !release.draft && release.published_at)
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
                body: (release.body || '').slice(0, 3000)
            });
        }
    }

    releases.sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
    versionMovements.sort((left, right) => left.repository.localeCompare(right.repository));
    return { releases, versionMovements };
}

module.exports = { collectPublicReleases };
