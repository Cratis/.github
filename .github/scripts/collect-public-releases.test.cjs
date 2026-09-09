// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { collectPublicReleases } = require('./collect-public-releases.cjs');
const org = 'ExampleOrg';
const since = new Date('2026-01-08T00:00:00Z');

// Synthetic metadata and releases only; every API call is mocked and inspected.
function repository(name, metadata = {}) {
    return { name, html_url: `https://github.com/${org}/${name}`, visibility: 'public', private: false, ...metadata };
}

function release(tag, publishedAt, extra = {}) {
    return { tag_name: tag, published_at: publishedAt, html_url: `https://example.invalid/releases/${tag}`, body: '## Added\n- Synthetic update', draft: false, ...extra };
}

// An unexpected endpoint or release request fails instead of reaching a network.
function mockGithub(repositories, metadata = {}, releaseData = {}) {
    const calls = [];
    const listForOrg = Symbol('listForOrg');
    const listReleases = Symbol('listReleases');
    const github = {
        rest: { repos: {
            listForOrg, listReleases,
            get: async options => {
                calls.push(['metadata', options.repo]);
                assert.deepEqual(options, { owner: org, repo: options.repo });
                const data = Object.hasOwn(metadata, options.repo) ? metadata[options.repo] : repositories.find(repo => repo.name === options.repo);
                if (data instanceof Error) throw data;
                return { data };
            }
        } },
        paginate: async (endpoint, options) => {
            if (endpoint === listForOrg) {
                assert.deepEqual(options, { org, type: 'public', per_page: 100 });
                calls.push(['list']);
                return repositories;
            }
            assert.equal(endpoint, listReleases);
            assert.deepEqual(options, { owner: org, repo: options.repo, per_page: 100 });
            calls.push(['releases', options.repo]);
            assert.ok(Object.hasOwn(releaseData, options.repo), 'Forbidden or unexpected release fetch');
            if (releaseData[options.repo] instanceof Error) throw releaseData[options.repo];
            return releaseData[options.repo];
        }
    };
    return { github, calls };
}

const deniedMetadata = [
    ['private', { visibility: 'private', private: true }],
    ['internal', { visibility: 'internal', private: false }],
    ['missing visibility', { visibility: undefined, private: false }],
    ['null visibility', { visibility: null, private: false }],
    ['unknown visibility', { visibility: 'future', private: false }],
    ['conflicting private flag', { visibility: 'public', private: true }],
    ['missing private flag', { visibility: 'public', private: undefined }],
    ['nonboolean private flag', { visibility: 'public', private: 'false' }]
];

for (const [name, metadata] of deniedMetadata) {
    test(`never fetches or includes ${name} listed repositories`, async () => {
        const mock = mockGithub([repository('HiddenWidget', metadata)]);
        assert.deepEqual(await collectPublicReleases({ ...mock, org, since }), { releases: [], versionMovements: [] });
        assert.deepEqual(mock.calls, [['list']]);
    });
    test(`never fetches or includes a public candidate with ${name} current metadata`, async () => {
        const mock = mockGithub([repository('ChangedWidget')], { ChangedWidget: repository('ChangedWidget', metadata) });
        assert.deepEqual(await collectPublicReleases({ ...mock, org, since }), { releases: [], versionMovements: [] });
        assert.deepEqual(mock.calls, [['list'], ['metadata', 'ChangedWidget']]);
    });
}

test('missing metadata response is denied before releases', async () => {
    const mock = mockGithub([repository('AbsentWidget')], { AbsentWidget: undefined });
    assert.deepEqual(await collectPublicReleases({ ...mock, org, since }), { releases: [], versionMovements: [] });
    assert.deepEqual(mock.calls, [['list'], ['metadata', 'AbsentWidget']]);
});

test('preserves public release filtering, ordering, version movement, title fallback and body limit', async () => {
    const mock = mockGithub([repository('ZetaWidget'), repository('AlphaWidget')], {}, {
        ZetaWidget: [release('old', '2026-01-01T00:00:00Z'), release('new', '2026-01-09T00:00:00Z', { name: 'New release', body: 'x'.repeat(3100) }), release('draft', '2026-01-12T00:00:00Z', { draft: true }), release('unpublished', null)],
        AlphaWidget: [release('boundary', since.toISOString(), { body: null })]
    });
    const result = await collectPublicReleases({ ...mock, org, since });
    assert.deepEqual(result.releases.map(item => [item.repository, item.title, item.body.length]), [['ZetaWidget', 'New release', 3000], ['AlphaWidget', 'boundary', 0]]);
    assert.deepEqual(result.versionMovements.map(item => [item.repository, item.previous?.tag, item.current.tag, item.repositoryUrl]), [
        ['AlphaWidget', undefined, 'boundary', repository('AlphaWidget').html_url],
        ['ZetaWidget', 'old', 'new', repository('ZetaWidget').html_url]
    ]);
    assert.deepEqual(mock.calls, [['list'], ['metadata', 'ZetaWidget'], ['releases', 'ZetaWidget'], ['metadata', 'AlphaWidget'], ['releases', 'AlphaWidget']]);
});

// Execute the actual collection step, including its production helper and output writes.
async function runWorkflow(github, writes, outputs) {
    const workflow = fs.readFileSync(path.join(__dirname, '../workflows/weekly-aggregated-release-notes.yml'), 'utf8');
    const step = workflow.split('      - name: Collect releases from organization repositories\n')[1].split('\n      - name: Summarize releases by category')[0];
    assert.match(step, /github-token: \$\{\{ github.token \}\}/);
    assert.doesNotMatch(step, /PAT_WORKFLOWS/);
    const script = step.split('          script: |\n')[1].replace(/^ {12}/gm, '');
    const fakeRequire = name => {
        if (name === 'fs') return { writeFileSync: (file, content) => writes.push({ file, data: JSON.parse(content) }) };
        if (name === 'path') return path;
        assert.equal(name, '/offline/.github/scripts/collect-public-releases.cjs');
        return { collectPublicReleases };
    };
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('require', 'process', 'github', 'context', 'core', script)(
        fakeRequire, { env: { GITHUB_WORKSPACE: '/offline', DAYS: '7' } }, github,
        { repo: { owner: org } }, { setOutput: (key, value) => { outputs[key] = value; } }
    );
}

test('offline workflow includes only public repositories in both JSON outputs', async () => {
    const mock = mockGithub([
        repository('OpenWidget'), repository('PrivateWidget', { visibility: 'private', private: true }),
        repository('InternalWidget', { visibility: 'internal' }), repository('UnknownWidget', { visibility: undefined }),
        repository('ChangedWidget')
    ], { ChangedWidget: repository('ChangedWidget', { visibility: 'private', private: true }) }, {
        OpenWidget: [release('v1', new Date().toISOString())]
    });
    const writes = [];
    const outputs = {};
    await runWorkflow(mock.github, writes, outputs);
    assert.deepEqual(writes.map(write => write.file), ['/offline/weekly-releases.json', '/offline/weekly-version-movements.json']);
    for (const write of writes) assert.deepEqual(write.data.map(item => item.repository), ['OpenWidget']);
    assert.equal(outputs.count, '1');
    assert.ok(Number.isFinite(Date.parse(outputs.since)));
    assert.deepEqual(mock.calls, [['list'], ['metadata', 'OpenWidget'], ['releases', 'OpenWidget'], ['metadata', 'ChangedWidget']]);
});

for (const status of [403, 404, 429, 500]) {
    test(`metadata failure ${status} stops workflow without writing even partially collected outputs`, async () => {
        const mock = mockGithub([repository('OpenWidget'), repository('UnavailableWidget')], {
            UnavailableWidget: Object.assign(new Error('Metadata unavailable'), { status })
        }, { OpenWidget: [release('v1', new Date().toISOString())] });
        const writes = [];
        const outputs = {};
        await assert.rejects(runWorkflow(mock.github, writes, outputs), /Metadata unavailable/);
        assert.deepEqual(writes, []);
        assert.deepEqual(outputs, {});
        assert.deepEqual(mock.calls.at(-1), ['metadata', 'UnavailableWidget']);
    });
}

test('release API failure stops workflow without output writes', async () => {
    const mock = mockGithub([repository('OpenWidget')], {}, { OpenWidget: new Error('Release API unavailable') });
    const writes = [];
    await assert.rejects(runWorkflow(mock.github, writes, {}), /Release API unavailable/);
    assert.deepEqual(writes, []);
});

test('organization listing failure stops workflow without output writes', async () => {
    const mock = mockGithub([]);
    mock.github.paginate = async () => { throw new Error('Listing unavailable'); };
    const writes = [];
    await assert.rejects(runWorkflow(mock.github, writes, {}), /Listing unavailable/);
    assert.deepEqual(writes, []);
});
