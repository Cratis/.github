// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function progressLogger({ clock = Date.now, write = console.error } = {}) {
    const started = clock();
    return message => write(`[org-stats +${((clock() - started) / 1000).toFixed(1)}s] ${message}`);
}
function retryPolicy(error, now) {
    const status = error.status || error.response?.status;
    const headers = error.response?.headers || error.headers || {};
    const header = name => typeof headers.get === 'function' ? headers.get(name) : headers[name];
    const errors = error.errors || error.response?.data?.errors || [];
    const message = [error.message, error.response?.data?.message, ...errors.map(e => e.message)].join(' ');
    const limited = status === 429 || errors.some(e => (e.type || e.extensions?.code) === 'RATE_LIMITED') || /rate.?limit|secondary rate|abuse detection/i.test(message) ||
        (status === 403 && (header('retry-after') != null || header('x-ratelimit-remaining') === '0'));
    const transientGraphql = errors.some(e => /^(RESOURCE_LIMITS|RATE_LIMITED|INTERNAL|SERVICE_UNAVAILABLE|TIMEOUT)$/.test(e.type || e.extensions?.code)) ||
        /timed?\s*out|timeout|resource limit|something went wrong while executing/i.test(message);
    const network = ['AbortError', 'TimeoutError'].includes(error.name) ||
        /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|UND_ERR_.*)$/.test(error.code || error.cause?.code || '') ||
        (error instanceof TypeError && /fetch failed|network/i.test(message));
    let delay = 0;
    const retryAfter = header('retry-after');
    if (retryAfter != null) delay = Math.max(0, /^\d+(\.\d+)?$/.test(String(retryAfter)) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now) || 0;
    // Secondary limits can carry an unrelated primary reset an hour away.
    const remaining = header('x-ratelimit-remaining');
    if (limited && header('x-ratelimit-reset') && (remaining === '0' || (remaining == null && retryAfter == null))) {
        delay = Math.max(delay, Number(header('x-ratelimit-reset')) * 1000 - now);
    }
    if (limited && !delay) delay = 60000;
    return { retry: status >= 500 && status <= 599 || status === 408 || limited || transientGraphql || network, delay };
}
async function retryGraphql(github, query, variables, { pause = wait, random = Math.random, clock = Date.now, progress = progressLogger() } = {}) {
    for (let attempt = 1; ; attempt++) {
        try { return await github.graphql(query, variables); }
        catch (error) {
            const policy = retryPolicy(error, clock());
            if (!policy.retry || attempt === 5) throw error;
            const delay = Math.max(policy.delay, 1000 * 2 ** (attempt - 1) * (1 + random() * 0.5));
            progress(`retry: attempt ${attempt + 1}/5 in ${(delay / 1000).toFixed(1)}s`);
            await pause(delay);
        }
    }
}
module.exports = { wait, progressLogger, retryPolicy, retryGraphql };
