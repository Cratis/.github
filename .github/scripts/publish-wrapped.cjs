// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const fs = require('node:fs');
const path = require('node:path');
const { collectWrapped } = require('./collect-wrapped.cjs');
const { renderWrapped, headline } = require('./render-wrapped.cjs');
const { localGithub } = require('./publish-org-stats.cjs');
function writeWrapped(out, numbers) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, renderWrapped(numbers));
}
function argumentsFor(args) {
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
        if (!['--year', '--out'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: publish-wrapped.cjs [--year YYYY] [--out path]');
        options[args[i].slice(2)] = args[i + 1];
    }
    return options;
}
async function main() {
    const started = Date.now(), options = argumentsFor(process.argv.slice(2));
    const numbers = await collectWrapped({ github: localGithub(process.env.GITHUB_TOKEN), year: options.year });
    const out = options.out || `release-digests/wrapped-${numbers.year}.md`;
    writeWrapped(out, numbers);
    console.log(headline(numbers));
    console.log(`Wrote ${out} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
module.exports = { writeWrapped, argumentsFor };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
