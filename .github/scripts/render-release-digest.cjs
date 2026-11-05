// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

// This is a formatting/link-context/privacy pass, not a release-body parser. Both the
// workflow's summary and stored digests use it; no clock or API is used.
// Offline: node .github/scripts/render-release-digest.cjs --write release-digests/*.md
// Verify:  node .github/scripts/render-release-digest.cjs --check release-digests/*.md

// Find an inline destination's end without interpreting or rewriting its URL.
function destinationEnd(text, start) {
    let depth = 1;
    for (let index = start; index < text.length; index++) {
        if (text[index] === '\\') {
            index++;
        } else if (text[index] === '(') {
            depth++;
        } else if (text[index] === ')' && --depth === 0) {
            return index + 1;
        }
    }
    // An ambiguous destination is left untouched, never guessed at.
    return text.length;
}

// Only the workflow's explicit, same-line attribution supplies repository context.
// Never infer it from a version table, neighboring bullet, link label or current tag.
function releaseBase(text, index) {
    // Raw HTML code containers are outside this deliberately small Markdown subset.
    if (/<\/?(?:code|pre|script|style|textarea)\b/i.test(text)) return null;
    const start = text.lastIndexOf('\n', index - 1) + 1;
    const attribution = text.slice(start).match(/^- \*\*([\w.-]+)\*\* \(\[(?:\\.|[^\[\]\\\r\n])+\]\(https:\/\/github\.com\/([\w-]+)\/([\w.-]+)\/releases\/tag\/([^\s?#()[\]\\<>]+)\)\): /);
    if (!attribution || index < start + attribution[0].length || attribution[1].toLowerCase() !== attribution[3].toLowerCase()) return null;
    let tag;
    try {
        tag = decodeURIComponent(attribution[4]);
    } catch {
        return null;
    }
    if (!tag || tag === '.' || tag === '..') return null;
    return `https://github.com/${attribution[2]}/${attribution[3]}/blob/${encodeURIComponent(tag)}/`;
}

// Recognize only an unambiguous inline destination, optionally angled or titled.
// Keep unsupported syntax byte-for-byte; never parse reference definitions here.
function rebaseDestination(destination, base) {
    if (!base) return destination;
    const parsed = destination.match(/^(<?)([^\s\\<>()\[\]`"']+)(>?)([ \t]+(?:"[^"\\\r\n()]*"|'[^'\\\r\n()]*'|\([^()\\\r\n]*\)))?([ \t]*)$/);
    if (!parsed || Boolean(parsed[1]) !== Boolean(parsed[3])) return destination;
    const href = parsed[2];
    if (/^(?:[a-z][a-z\d+.-]*:|[\/#?])/i.test(href)) return destination;
    // Entity-encoded syntax and encoded path separators/dot segments are ambiguous.
    const [pathname] = href.split(/[?#]/, 1);
    if (/&(?:#\d+|#x[\da-f]+|[a-z]+);|%(?![\da-f]{2})/i.test(href) || /%(?:2e|2f|5c)/i.test(pathname)) return destination;
    const segments = [];
    for (const segment of pathname.split('/')) {
        if (segment === '..') {
            assert(segments.length, `Release link escapes repository root: ${href} (${base})`);
            segments.pop();
        } else if (segment !== '.') {
            segments.push(segment);
        }
    }
    if (!segments.join('/')) return destination;
    const rebased = base + segments.join('/') + href.slice(pathname.length);
    return parsed[1] + rebased + parsed[3] + (parsed[4] || '') + parsed[5];
}

// Quote only bare analyzer-family literals and rebase attributed inline links.
// Existing code, escapes, autolinks, HTML and bare URLs are copied verbatim.
// Link/reference labels stay intact; ambiguous destinations are never guessed at.
function quoteAnalyzerFamilies(text, rebaseLinks = true) {
    let result = '';
    const headingLines = new Set();
    for (let index = 0; index < text.length;) {
        const rest = text.slice(index);
        let length = 1;
        if ((index === 0 || text[index - 1] === '\n') && /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(rest)) {
            headingLines.add(text.slice(0, index).split('\n').length - 1);
            length = rest.indexOf('\n') === -1 ? rest.length : rest.indexOf('\n');
        } else if (rest[0] === '\\') {
            length = Math.min(2, rest.length);
        } else if (rest[0] === '`') {
            const delimiter = rest.match(/^`+/)[0];
            const runs = /`+/g;
            runs.lastIndex = index + delimiter.length;
            let closing;
            while ((closing = runs.exec(text))) {
                if (closing[0] === delimiter) break;
            }
            // Fail closed for an unmatched delimiter: adding backticks later could
            // accidentally pair with it and change the surrounding prose into code.
            length = closing ? closing.index + delimiter.length - index : rest.length;
        } else if (rest[0] === '[') {
            // Reference labels are identifiers too. Leave bracketed link/image
            // text unchanged so quoting cannot change reference resolution.
            let depth = 1;
            let end = index + 1;
            for (; end < text.length; end++) {
                if (text[end] === '\\') end++;
                else if (text[end] === '[') depth++;
                else if (text[end] === ']' && --depth === 0) break;
            }
            length = end - index;
            if (end < text.length && text[end + 1] === '(') {
                const linkEnd = destinationEnd(text, end + 2);
                const destination = text.slice(end + 2, linkEnd - 1);
                // Images, nested labels and unmatched destinations retain their bytes.
                if (!/[\[`]/.test(text.slice(index + 1, end)) && !/[\]!]/.test(text[index - 1] || '') && text[linkEnd - 1] === ')') {
                    const rebased = rebaseDestination(destination, rebaseLinks ? releaseBase(text, index) : null);
                    if (rebased !== destination) {
                        result += text.slice(index, end + 2) + rebased + ')';
                        index = linkEnd;
                        continue;
                    }
                }
            }
        } else if (rest.startsWith('](')) {
            length = destinationEnd(text, index + 2) - index;
        } else {
            const protectedText = rest.match(/^(?:<[^>]*>|(?:[a-z][a-z\d+.-]*:\/\/|mailto:|www\.)[^\s<>]+)/i);
            const literal = rest.match(/^ARC(?:CHR)?\*(?![\w*])/);
            if (protectedText) {
                length = protectedText[0].length;
            } else if (literal && (index === 0 || !/[\w\\./#?=&%*`-]/.test(text[index - 1]))) {
                result += `\`${literal[0]}\``;
                index += literal[0].length;
                continue;
            }
        }
        result += text.slice(index, index + length);
        index += length;
    }
    return { text: result, headingLines };
}

function loadPrivateRepositories(file) {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/)
        .map(line => line.split('#', 1)[0].trim()).filter(Boolean);
}

function privateUrl(url, privateRepositories) {
    const target = new URL(url.replace(/[.,;:!?]+$/, ''), 'https://github.com');
    const [owner, repository] = target.pathname.slice(1).split('/');
    return owner.toLowerCase() === 'cratis' && privateRepositories.has(repository?.toLowerCase());
}

function removePrivateReferences(line, privateRepositories) {
    const githubUrl = String.raw`(?:https?:)?\/\/github\.com\/[^\s<>()\x60"'\]]+(?:\([^\s<>()\x60]*\)[^\s<>()\x60"'\]]*)*`;
    const markdownLink = new RegExp(String.raw`!?\[([^\]\n]*)\]\(\s*<?(${githubUrl})>?(?:[ \t]+["'][^\n]*?["'])?\s*\)`, 'gi');
    const autolinkOrUrl = new RegExp(String.raw`<(${githubUrl})>|(${githubUrl})`, 'gi');
    const sanitized = line
        .replace(markdownLink, (link, text, url) => privateUrl(url, privateRepositories) ? text : link)
        .replace(autolinkOrUrl, (link, autolink, url) => privateUrl(autolink || url, privateRepositories) ? (url?.match(/[.,;:!?]+$/)?.[0] || '') : link)
        .replace(/`?Cratis\/([\w.-]+)#\d+\b`?/gi, (reference, repository) => privateRepositories.has(repository.toLowerCase()) ? '' : reference);
    if (sanitized === line) return line;
    return sanitized.replace(/[ \t]*\([ \t,;]*\)/g, '').replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ').replace(/[ \t]+([,.;:!?])/g, '$1').trimEnd();
}

function dropEmptyPrivateTables(lines, output) {
    for (let index = 0; index < lines.length - 1; index++) {
        if (!/^\|/.test(lines[index]) || !/^\|[ \t]*:?-+/.test(lines[index + 1])) continue;
        let end = index + 2;
        while (end < lines.length && /^\|/.test(lines[end])) end++;
        if (end > index + 2 && output.slice(index + 2, end).every(line => line === null)) {
            output[index] = null;
            output[index + 1] = null;
        }
        index = end - 1;
    }
}

function dropEmptyPrivateSections(lines, output) {
    // Work backwards so parents also lose headings for now-empty subsections.
    for (let index = lines.length - 1; index >= 0; index--) {
        const heading = lines[index].match(/^(#{1,6})[ \t]+/);
        if (!heading) continue;
        let end = index + 1;
        for (; end < lines.length; end++) {
            const next = lines[end].match(/^(#{1,6})[ \t]+/);
            if (next && next[1].length <= heading[1].length) break;
        }
        if (lines.slice(index + 1, end).some(line => line.trim()) && !output.slice(index + 1, end).some(line => line?.trim())) output[index] = null;
    }
}

function removePrivateContent(lines, privateRepositories) {
    const privateNames = new Set(Array.from(privateRepositories, name => name.toLowerCase()));
    if (!privateNames.size) return lines;
    let removingBullet = false;
    let afterBlank = false;
    const output = lines.map(line => {
        const subject = line.match(/^- \*\*([\w.-]+)\*\* \(/);
        if (/^(?:[-+*][ \t]+|\d+[.)][ \t]+|#{1,6}[ \t]+|\|)/.test(line) || (afterBlank && /^\S/.test(line))) removingBullet = false;
        if (subject && privateNames.has(subject[1].toLowerCase())) removingBullet = true;
        afterBlank = !line.trim();
        if (removingBullet && line.trim()) return null;
        const row = line.match(/^\|[ \t]*(?:\[([\w.-]+)\]\([^)]*\)|([\w.-]+))[ \t]*\|/);
        if (row && privateNames.has((row[1] || row[2]).toLowerCase())) return null;
        return removePrivateReferences(line, privateNames);
    });
    dropEmptyPrivateTables(lines, output);
    dropEmptyPrivateSections(lines, output);
    const retained = [];
    let removed = false;
    for (const line of output) {
        if (line === null) removed = true;
        else if (!(removed && !line.trim() && retained.at(-1) === '')) {
            retained.push(line);
            if (line.trim()) removed = false;
        }
    }
    return retained;
}

// Exclude explicitly private content when a list is supplied, then normalize
// heading boundaries, analyzer literals and attributed hrefs. Other facts stay intact.
function renderReleaseDigest(markdown, { privateRepositories = [] } = {}) {
    const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
    assert(!markdown.replace(/\r\n/g, '').includes('\r'), 'Unsupported line endings');
    assert(newline !== '\r\n' || !markdown.replace(/\r\n/g, '').includes('\n'), 'Mixed line endings');
    const lines = removePrivateContent(markdown.split(newline), privateRepositories);
    const output = [];
    let fence = null;
    let paragraph = [];
    let paragraphAllowsRebasing = true;
    let htmlCode = null;
    let afterHeading = false;

    // Add spacing only at real headings, never inside multiline code spans.
    function append(line, heading = false) {
        if ((afterHeading || heading) && line.trim() && output.length && output.at(-1).trim()) output.push('');
        output.push(line);
        afterHeading = heading;
    }

    // Process a whole paragraph so backtick spans can cross physical lines.
    function flushParagraph() {
        if (paragraph.length) {
            const formatted = quoteAnalyzerFamilies(paragraph.join(newline), paragraphAllowsRebasing);
            formatted.text.split(newline).forEach((line, index) => append(line, formatted.headingLines.has(index)));
            paragraph = [];
            paragraphAllowsRebasing = true;
        }
    }

    for (const line of lines) {
        // Recognize nested/quoted fences conservatively; never format their bodies.
        const fenceLine = line.replace(/^(?:[ \t]*>[ \t]?)+/, '').trimStart().replace(/^(?:[-+*]|\d+[.)])[ \t]+/, '');
        if (fence) {
            output.push(line);
            const closing = fenceLine.match(/^(`{3,}|~{3,})[ \t]*$/);
            if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = null;
            continue;
        }
        // Raw HTML code blocks can span blank lines. Disable only the new href
        // pass there, keeping the preexisting formatting behavior independent.
        const htmlOpening = line.match(/^ {0,3}<(code|pre|script|style|textarea)\b/i);
        if (!htmlCode && htmlOpening) htmlCode = htmlOpening[1].toLowerCase();
        const htmlCodeLine = Boolean(htmlCode);
        if (htmlCode && new RegExp(`</${htmlCode}\\s*>`, 'i').test(line)) htmlCode = null;
        const opening = fenceLine.match(/^(`{3,}|~{3,})(.*)$/);
        const protectedLine = /^(?: {4}|\t| {0,3}\[[^\]]+\]:|[ \t]*\|)/.test(line);
        if (opening || protectedLine || !line.trim()) flushParagraph();
        if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
            fence = opening[1];
            append(line);
        } else if (protectedLine || !line.trim()) {
            append(line);
        } else {
            paragraphAllowsRebasing &&= !htmlCodeLine;
            paragraph.push(line);
        }
    }
    flushParagraph();
    // Do not trim whitespace inside code, even for an unterminated fence.
    if (!fence) while (output.length && output.at(-1) === '') output.pop();
    return output.join(newline) + (fence ? '' : newline);
}

// Check every input before any writes. Only this deterministic formatter rewrites
// historical files; it does not reconstruct, fetch or republish their release data.
function main(args) {
    const [mode, ...files] = args;
    assert(['--check', '--write'].includes(mode) && files.length,
        'Usage: node .github/scripts/render-release-digest.cjs --check|--write FILE...');
    const privateRepositories = loadPrivateRepositories(path.join(__dirname, '../../release-digests/private-repositories.txt'));
    const rendered = files.map(file => {
        const before = fs.readFileSync(file, 'utf8');
        const after = renderReleaseDigest(before, { privateRepositories });
        assert.equal(renderReleaseDigest(after, { privateRepositories }), after, `Non-idempotent formatting: ${file}`);
        return { file, before, after };
    });
    const changed = rendered.filter(({ before, after }) => before !== after);
    if (mode === '--write') {
        for (const { file, after } of changed) fs.writeFileSync(file, after);
    } else if (changed.length) {
        process.exitCode = 1;
    }
    for (const { file } of changed) console.log(`${mode === '--write' ? 'Rendered' : 'Needs rendering'} ${file}`);
    console.log(`${files.length} digests checked; ${changed.length} ${mode === '--write' ? 'rendered' : 'need rendering'}.`);
}

module.exports = { renderReleaseDigest, loadPrivateRepositories };
if (require.main === module) main(process.argv.slice(2));
