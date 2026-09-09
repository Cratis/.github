// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderReleaseDigest } = require('./render-release-digest.cjs');

// All fixtures are in memory: no network, clock-dependent assertions or publication.
const examples = [
    {
        name: 'spaces headings and adjacent lists without changing heading anchors',
        before: '# Digest\n## Added\n- one\n- two\n## Fixed\n- three',
        after: '# Digest\n\n## Added\n\n- one\n- two\n\n## Fixed\n\n- three\n'
    },
    {
        name: 'quotes bare analyzer families, not identifiers or emphasis',
        before: '- (ARC* and ARCCHR*), ARC*; XARC*, ARC*more, *ARC*, **ARC***.\n',
        after: '- (`ARC*` and `ARCCHR*`), `ARC*`; XARC*, ARC*more, *ARC*, **ARC***.\n'
    },
    {
        name: 'preserves existing code spans and escaped literals',
        before: '- `ARC*`, `` ARCCHR* ` ARC* ` ``, ARC\\*, \\ARC*, and ARC*.\n',
        after: '- `ARC*`, `` ARCCHR* ` ARC* ` ``, ARC\\*, \\ARC*, and `ARC*`.\n'
    },
    {
        name: 'preserves multiline code spans containing heading syntax',
        before: '- ``ARC*\n## Added\nARCCHR*`` and ARC*.\n',
        after: '- ``ARC*\n## Added\nARCCHR*`` and `ARC*`.\n'
    },
    {
        name: 'recognizes exact backtick runs and unmatched literal backticks',
        before: '- ``ARC* ` ARCCHR*`` and ` unmatched ARC*.\n',
        after: '- ``ARC* ` ARCCHR*`` and ` unmatched ARC*.\n'
    },
    {
        name: 'preserves backtick fenced code, longer closers and blank code lines',
        before: '## Added\n```text\n## Fixed\n\nARC*\n~~~\n```not-a-close\nARCCHR*\n````\n- ARC*\n',
        after: '## Added\n\n```text\n## Fixed\n\nARC*\n~~~\n```not-a-close\nARCCHR*\n````\n- `ARC*`\n'
    },
    {
        name: 'preserves tilde fences, short nonclosers and nested fences',
        before: '~~~~text\n## Added\nARC*\n~~~\nARCCHR*\n~~~~\n- item\n  ```text\n  ARC*\n  ```\n',
        after: '~~~~text\n## Added\nARC*\n~~~\nARCCHR*\n~~~~\n- item\n  ```text\n  ARC*\n  ```\n'
    },
    {
        name: 'preserves quoted fences and indented code',
        before: '> ```text\n> ## Added\n> ARC*\n> ```\n\n    ARCCHR*\n\tARC*\n',
        after: '> ```text\n> ## Added\n> ARC*\n> ```\n\n    ARCCHR*\n\tARC*\n'
    },
    {
        name: 'preserves an unterminated fence including trailing blank lines',
        before: '```text\n## Added\nARC*\n\n',
        after: '```text\n## Added\nARC*\n\n'
    },
    {
        name: 'preserves an unterminated code body without a final newline',
        before: '```text\nARC*',
        after: '```text\nARC*'
    },
    {
        name: 'preserves a fence introduced by a list marker',
        before: '- ```text\n  ## Added\n  ARC*\n  ```\n',
        after: '- ```text\n  ## Added\n  ARC*\n  ```\n'
    },
    {
        name: 'preserves URLs, nested destinations, reference definitions and HTML attributes',
        before: '- [label](../ARC*/(ARCCHR*)/x "ARC*") https://example.com/ARC*?q=ARCCHR* <https://example.com/ARC*> www.example.com/ARC* <a href="ARC*">link</a> ARC*.\n\n[id]: ../ARC*/x "ARCCHR*"\n',
        after: '- [label](../ARC*/(ARCCHR*)/x "ARC*") https://example.com/ARC*?q=ARCCHR* <https://example.com/ARC*> www.example.com/ARC* <a href="ARC*">link</a> `ARC*`.\n\n[id]: ../ARC*/x "ARCCHR*"\n'
    },
    {
        name: 'preserves reference identifiers and nested link labels',
        before: '- [ARC*], [ARCCHR*][ARC*], [nested [ARC*]](./ARC*) and ARC*.\n\n[ARC*]: ./ARCCHR*\n',
        after: '- [ARC*], [ARCCHR*][ARC*], [nested [ARC*]](./ARC*) and `ARC*`.\n\n[ARC*]: ./ARCCHR*\n'
    },
    {
        name: 'preserves escaped URL parentheses and ambiguous destinations',
        before: '- [link](../ARC*/x\\)y) ARC* [other](../ARC*\n',
        after: '- [link](../ARC*/x\\)y) `ARC*` [other](../ARC*\n'
    },
    {
        name: 'does not change table formatting or heading text',
        before: '## ARC* {#existing-anchor}\n| Repo | ARC* |\n| --- | --- |\n| Arc | ARCCHR* |\n',
        after: '## ARC* {#existing-anchor}\n\n| Repo | ARC* |\n| --- | --- |\n| Arc | ARCCHR* |\n'
    },
    {
        name: 'retains prose, dates, versions, contributor references and CRLF',
        before: '# 2026-05-18 to 2026-05-25\r\n## Added\r\n- à-la-carte v20.47.0 by @contributor (#2286): ARC*.\r\n',
        after: '# 2026-05-18 to 2026-05-25\r\n\r\n## Added\r\n\r\n- à-la-carte v20.47.0 by @contributor (#2286): `ARC*`.\r\n'
    },
    {
        name: 'emits a single trailing newline for generated prose',
        before: '## Deprecated\n\n- No updates\n\n',
        after: '## Deprecated\n\n- No updates\n'
    }
];

const ante = '- **Ante** ([Release v0.5.0](https://github.com/Cratis/Ante/releases/tag/v0.5.0)): ';
const arc = '- **Arc** ([Release v22.10.5](https://github.com/Cratis/Arc/releases/tag/v22.10.5)): ';
const anteBase = 'https://github.com/Cratis/Ante/blob/v0.5.0/';
const linkExamples = [
    {
        name: 'rebases the two confirmed Ante links at their attributed release tag',
        before: ante + '[Host Integration](./Documentation/host-integration.md#known-limitation-the-inbox-source-store) and [Configuration](./Documentation/configuration.md#known-limitation-the-inbox-source-store-is-not-configurable). (#18)\n',
        after: ante + `[Host Integration](${anteBase}Documentation/host-integration.md#known-limitation-the-inbox-source-store) and [Configuration](${anteBase}Documentation/configuration.md#known-limitation-the-inbox-source-store-is-not-configurable). (#18)\n`
    },
    {
        name: 'preserves query and fragment bytes, link text, titles and angle delimiters',
        before: ante + '[ARC*](Documentation/file%20name.md?raw=1&value=%2F#Section) [title](./x.md "Read me") [angle](<./y.md?q=a+b#part> \'Details\')\n',
        after: ante + `[ARC*](${anteBase}Documentation/file%20name.md?raw=1&value=%2F#Section) [title](${anteBase}x.md "Read me") [angle](<${anteBase}y.md?q=a+b#part> 'Details')\n`
    },
    {
        name: 'takes context from each bullet, not its release title or neighboring repository',
        before: ante + '[a](./x.md)\n' + arc + '[b](docs/../y.md)\n- No attribution [c](./z.md)\n',
        after: ante + `[a](${anteBase}x.md)\n` + arc + '[b](https://github.com/Cratis/Arc/blob/v22.10.5/y.md)\n- No attribution [c](./z.md)\n'
    },
    {
        name: 'uses the source URL tag rather than the displayed version or version table',
        before: ante.replace('Release v0.5.0', 'Release v99.0.0') + '[a](./x.md)\n',
        after: ante.replace('Release v0.5.0', 'Release v99.0.0') + `[a](${anteBase}x.md)\n`
    },
    {
        name: 'encodes a slash-containing source tag as one blob ref',
        before: ante.replace('/tag/v0.5.0', '/tag/stable%2Fv0.5.0') + '[a](./x.md)\n',
        after: ante.replace('/tag/v0.5.0', '/tag/stable%2Fv0.5.0') + '[a](https://github.com/Cratis/Ante/blob/stable%2Fv0.5.0/x.md)\n'
    },
    {
        name: 'retains CRLF when rebasing attributed links',
        before: ante + '[a](./x.md?q=1#part)\r\n',
        after: ante + `[a](${anteBase}x.md?q=1#part)\r\n`
    }
];

for (const [name, body] of [
    ['absolute, protocol-relative, site-root and fragment-only URLs', '[a](https://example.com/x?q=1#part) [b](/docs/x.md) [c](//example.com/x) [d](#part) [e](?q=1) [f](mailto:a@example.com)'],
    ['code spans, escaped links and bare URLs', '`[a](./x.md)` ``[b](./y.md) ` `` \\[escaped](./z.md) https://example.com/x ./Documentation/x.md'],
    ['reference labels, definitions and nested labels', '[ref][id] [id] [nested [label]](./x.md)\n\n[id]: ./Documentation/x.md "Title"'],
    ['ambiguous escapes, balanced parentheses, entities and malformed targets', '[a](./x\\)y.md) [b](./x(y).md) [c](./x.md?a=1&amp;b=2) [d](./x%2Fy.md) [e](./%2e%2e/x.md) [f](./x%ZZ.md) [g](./unfinished'],
    ['ambiguous titles and nested code labels', '[a](./x.md "Title (part)") [`code [a](./x.md)`](./y.md)'],
    ['HTML code containers and attributes', '<code>[a](./x.md)</code> <pre>[b](./y.md)</pre> <a href="./x.md">link</a>'],
    ['image destinations and image reference labels', '![image](./x.png) ![image][id]'],
    ['unmatched backticks', '`[a](./x.md)'],
    ['unattributed continuation lines', 'Prose\n  [a](./x.md)']
]) {
    const markdown = ante + body + '\n';
    linkExamples.push({ name: `does not rebase ${name}`, before: markdown, after: markdown });
}

for (const attribution of [
    ante.replace('**Ante**', '**Arc**'),
    ante.replace('github.com/', 'github.com.evil/'),
    ante.replace('/tag/v0.5.0', '/latest'),
    ante.replace('/tag/v0.5.0', '/tag/%ZZ'),
    '- [Release](https://github.com/Cratis/Ante/releases/tag/v0.5.0): '
]) {
    const markdown = attribution + '[a](./x.md)\n';
    linkExamples.push({ name: `leaves unsupported attribution intact: ${attribution}`, before: markdown, after: markdown });
}

for (const [name, markdown] of [
    ['backtick fences', '```md\n' + ante + '[a](./x.md)\n```\n'],
    ['tilde fences', '~~~md\n' + ante + '[a](./x.md)\n~~~\n'],
    ['quoted fences', '> ```md\n> ' + ante + '[a](./x.md)\n> ```\n'],
    ['indented code', '    ' + ante + '[a](./x.md)\n'],
    ['HTML blocks across blank lines', '<pre>\n\n' + ante + '[a](./x.md)\n\n</pre>\n'],
    ['raw script blocks', '<script>\n\n' + ante + '[a](./x.md)\n</script>\n'],
    ['multiline code spans', ante + '`code\n' + arc + '[a](./x.md)`\n']
]) {
    linkExamples.push({ name: `does not rebase URLs inside ${name}`, before: markdown, after: markdown });
}

for (const { name, before, after } of [...examples, ...linkExamples]) {
    test(name, () => {
        assert.equal(renderReleaseDigest(before), after);
        assert.equal(renderReleaseDigest(after), after, 'Formatting must be idempotent');
    });
}

test('rejects ambiguous mixed line endings instead of rewriting content', () => {
    assert.throws(() => renderReleaseDigest('# Digest\r\n## Added\n- ARC*'), /Mixed line endings/);
});

test('fails clearly rather than rebasing outside the attributed repository root', () => {
    assert.throws(() => renderReleaseDigest(ante + '[a](../x.md)\n'), /Release link escapes repository root/);
});

test('the workflow uses the same deterministic final renderer (offline script harness)', async () => {
    const workflow = fs.readFileSync(path.join(__dirname, '../workflows/weekly-aggregated-release-notes.yml'), 'utf8');
    const summaryStep = workflow.split('      - name: Summarize releases by category\n')[1].split('\n      - name: Prepare fallback summary')[0];
    const script = summaryStep.split('          script: |\n')[1].replace(/^ {12}/gm, '');
    const release = {
        repository: 'Arc', title: 'Release v20.47.0', url: 'https://github.com/Cratis/Arc/releases/tag/v20.47.0',
        body: '## Added\n- Analyzer families ARC* and ARCCHR* for @contributor (#2286). [Guide](./Documentation/guide.md?q=1#part) and `[code](./untouched.md)`.\n## Fixed\n- None'
    };
    const writes = [];
    const fakeFs = {
        readFileSync: file => JSON.stringify(file.endsWith('weekly-releases.json') ? [release] : []),
        writeFileSync: (file, text) => writes.push({ file, text })
    };
    const fakeRequire = name => {
        if (name === 'fs') return fakeFs;
        if (name === 'path') return path;
        assert.equal(name, '/offline/.github/scripts/render-release-digest.cjs');
        return { renderReleaseDigest };
    };
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('require', 'process', script)(fakeRequire, { env: { GITHUB_WORKSPACE: '/offline', DAYS: '7' } });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].file, '/offline/weekly-release-summary.md');
    assert.match(writes[0].text, /## Added\n\n- \*\*Arc\*\*/);
    assert.match(writes[0].text, /Analyzer families `ARC\*` and `ARCCHR\*` for @contributor \(#2286\)\./);
    assert.ok(writes[0].text.includes('[Guide](https://github.com/Cratis/Arc/blob/v20.47.0/Documentation/guide.md?q=1#part) and `[code](./untouched.md)`.'));
    assert.match(writes[0].text, /## Fixed\n\n- No updates/);
    assert.equal(renderReleaseDigest(writes[0].text), writes[0].text);
});
