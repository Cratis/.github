// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { retryGraphql, progressLogger } = require('./org-stats-client.cjs');
const { localGithub } = require('./publish-org-stats.cjs');
function fakeClient(errors) {
    let calls = 0;
    return { get calls() { return calls; }, graphql: async (query, variables) => {
        assert.equal(query, 'query'); assert.deepEqual(variables, { org: 'Cratis' });
        const error = errors[calls++];
        if (error) throw error;
        return { ok: true };
    } };
}
const error = extra => Object.assign(new Error('API failure'), extra);
const noWait = { pause: async () => {}, random: () => 0, progress: () => {}, clock: () => Date.parse('2026-10-21T04:00:00Z') };
for (const [name, failure] of [
    ['HTTP 502', error({ status: 502 })], ['HTTP 503', error({ status: 503 })],
    ['network reset', error({ code: 'ECONNRESET' })], ['DNS failure', error({ cause: { code: 'EAI_AGAIN' } })],
    ['fetch failure', new TypeError('fetch failed')], ['request timeout', error({ name: 'TimeoutError' })],
    ['GraphQL resource limit', error({ errors: [{ type: 'RESOURCE_LIMITS', message: 'Too expensive' }] })],
    ['GraphQL timeout', error({ errors: [{ message: 'Something timed out while executing your query' }] })],
    ['GraphQL internal failure', error({ errors: [{ extensions: { code: 'INTERNAL' } }] })]
]) test(`retries ${name} with the same query and variables`, async () => {
    const client = fakeClient([failure]);
    assert.deepEqual(await retryGraphql(client, 'query', { org: 'Cratis' }, noWait), { ok: true });
    assert.equal(client.calls, 2);
});
test('retry exhaustion uses five attempts, exponential backoff and jitter, then preserves the error', async () => {
    const failure = error({ status: 502 }), delays = [], logs = [];
    const client = fakeClient(Array(5).fill(failure));
    await assert.rejects(retryGraphql(client, 'query', { org: 'Cratis' }, { ...noWait, random: () => 0.5,
        pause: async ms => delays.push(ms), progress: line => logs.push(line) }), e => e === failure);
    assert.equal(client.calls, 5);
    assert.deepEqual(delays, [1250, 2500, 5000, 10000]);
    assert.equal(logs.length, 4); assert.match(logs.at(-1), /attempt 5\/5/);
});
for (const failure of [error({ status: 401 }), error({ status: 403 }), error({ status: 404 }), error({ status: 422 }),
    error({ errors: [{ type: 'NOT_FOUND', message: 'Repository unavailable' }] })]) {
    test(`does not retry permanent errors (${failure.status || 'GraphQL NOT_FOUND'})`, async () => {
        const client = fakeClient([failure]);
        await assert.rejects(retryGraphql(client, 'query', { org: 'Cratis' }, noWait), e => e === failure);
        assert.equal(client.calls, 1);
    });
}
for (const [name, failure, delay] of [
    ['429 retry-after seconds', error({ status: 429, response: { headers: { 'retry-after': '120' } } }), 120000],
    ['403 reset', error({ status: 403, response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Date.parse('2026-10-21T04:02:00Z') / 1000) } } }), 120000],
    ['secondary rate limit', new Error('You have exceeded a secondary rate limit'), 60000],
    ['secondary retry-after without waiting for unrelated primary reset', error({ status: 429, headers: { 'retry-after': '60', 'x-ratelimit-remaining': '1000', 'x-ratelimit-reset': String(Date.parse('2026-10-21T05:00:00Z') / 1000) } }), 60000],
    ['secondary fallback without waiting for unrelated primary reset', error({ status: 429, headers: { 'x-ratelimit-remaining': '1000', 'x-ratelimit-reset': String(Date.parse('2026-10-21T05:00:00Z') / 1000) } }), 60000],
    ['primary reset later than retry-after', error({ status: 403, headers: { 'retry-after': '60', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Date.parse('2026-10-21T04:02:00Z') / 1000) } }), 120000],
    ['429 without headers', error({ status: 429 }), 60000],
    ['GraphQL RATE_LIMITED', error({ errors: [{ type: 'RATE_LIMITED' }] }), 60000],
    ['retry-after HTTP date', error({ status: 403, headers: new Headers({ 'retry-after': 'Wed, 21 Oct 2026 04:01:30 GMT' }) }), 90000],
    ['503 retry-after', error({ status: 503, headers: { 'retry-after': '7' } }), 7000]
]) test(`honors ${name}`, async () => {
    const delays = [], client = fakeClient([failure]);
    await retryGraphql(client, 'query', { org: 'Cratis' }, { ...noWait, pause: async ms => delays.push(ms) });
    assert.deepEqual(delays, [delay]);
});
test('local HTTP and GraphQL adapters retain retry metadata and existing error text', async () => {
    const client = localGithub('not-a-real-token', async () => new Response('', { status: 502, headers: { 'retry-after': '5' } }));
    await assert.rejects(client.graphql('query'), e => e.message === 'GitHub GraphQL returned HTTP 502' && e.status === 502 && e.response.headers.get('retry-after') === '5');
    const graphql = localGithub('not-a-real-token', async () => Response.json({ errors: [{ type: 'RESOURCE_LIMITS', message: 'Too expensive' }] }));
    await assert.rejects(graphql.graphql('query'), e => e.message === 'GitHub GraphQL: Too expensive' && e.errors[0].type === 'RESOURCE_LIMITS');
    let calls = 0;
    const recovering = localGithub('not-a-real-token', async () => ++calls === 1 ? new Response('', { status: 502 }) : Response.json({ data: { ok: true } }));
    assert.deepEqual(await retryGraphql(recovering, 'query', {}, noWait), { ok: true });
    assert.equal(calls, 2);
    const secondary = localGithub('not-a-real-token', async () => Response.json({ message: 'You have exceeded a secondary rate limit' }, { status: 403 }));
    await assert.rejects(secondary.graphql('query'), e => {
        assert.equal(e.message, 'GitHub GraphQL returned HTTP 403');
        assert.deepEqual(require('./org-stats-client.cjs').retryPolicy(e, noWait.clock()), { retry: true, delay: 60000 });
        return true;
    });
});
test('progress logger writes elapsed seconds to the supplied stderr sink', () => {
    let now = 1000;
    const lines = [], progress = progressLogger({ clock: () => now, write: line => lines.push(line) });
    now = 2250; progress('repos: starting');
    assert.deepEqual(lines, ['[org-stats +1.3s] repos: starting']);
});
