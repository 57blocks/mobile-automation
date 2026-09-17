#!/usr/bin/env tsx
/**
 * Summarizes the latest Allure results as Markdown: a pass/fail table plus the failure
 * messages. Read this after a run instead of piping a 6,000-line wdio log anywhere.
 *
 * Usage:
 *   npm run summary
 *   npm run summary --silent >> "$GITHUB_STEP_SUMMARY"   # GitHub Actions
 *
 * Not `node scripts/summarize-allure.ts`: Node's type stripping does not remap `./x.js` to
 * `x.ts`, so that only works while this file has no relative imports.
 */
import fs from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = process.env.ALLURE_RESULTS_DIR || 'allure-results';
const PAGES_BASE_URL = process.env.PAGES_BASE_URL || '';
const RUN_DIR = process.env.PAGES_RUN_DIR || '';

/** One `*-result.json` entry, as much of it as this summary reads. */
interface AllureResult {
    name?: string;
    status?: string;
    statusDetails?: { message?: string };
}

interface Failure {
    name: string;
    status: string;
    message: string;
}

const statuses: Record<string, number> = { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
const failures: Failure[] = [];

function collect(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) continue;
        if (!entry.endsWith('-result.json')) continue;

        let data: AllureResult;
        try {
            data = JSON.parse(fs.readFileSync(full, 'utf8'));
        } catch {
            continue;
        }

        const status = data.status || 'unknown';
        statuses[status] = (statuses[status] ?? 0) + 1;
        if (status === 'failed' || status === 'broken') {
            failures.push({
                name: data.name || entry,
                status,
                message: (data.statusDetails && data.statusDetails.message) || '',
            });
        }
    }
}

collect(RESULTS_DIR);

const total = Object.values(statuses).reduce((a, b) => a + b, 0);

const lines = [];
lines.push('## Test Results');
lines.push('');
lines.push('| Status | Count |');
lines.push('| --- | --- |');
lines.push(`| ✅ Passed | ${statuses.passed} |`);
lines.push(`| ❌ Failed | ${statuses.failed} |`);
lines.push(`| 💥 Broken | ${statuses.broken} |`);
lines.push(`| ⏭️ Skipped | ${statuses.skipped} |`);

// Anything Allure reports outside the four above still counts toward the total, so give it a
// row rather than letting the column fail to add up.
for (const [status, count] of Object.entries(statuses)) {
    if (['passed', 'failed', 'broken', 'skipped'].includes(status) || count === 0) continue;
    lines.push(`| ❔ ${status} | ${count} |`);
}

lines.push(`| **Total** | **${total}** |`);
lines.push('');

if (total === 0) {
    lines.push(`_No results found in \`${RESULTS_DIR}\`. Did the run get as far as creating a session?_`);
}

if (PAGES_BASE_URL && RUN_DIR) {
    lines.push(`📊 **Allure report:** ${PAGES_BASE_URL}/${RUN_DIR}/`);
    lines.push('');
}

if (failures.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>🔴 ${failures.length} failing/broken test(s)</summary>`);
    lines.push('');
    for (const f of failures) {
        lines.push(`**${f.status === 'broken' ? '💥' : '❌'} ${f.name}** (_${f.status}_)`);
        if (f.message) {
            // A message containing three backticks would otherwise close this fence early
            // and corrupt everything the summary renders after it.
            const line = f.message.split('\n')[0].slice(0, 300).replace(/```/g, '\u200b```');
            lines.push('');
            lines.push('```');
            lines.push(line);
            lines.push('```');
        }
        lines.push('');
    }
    lines.push('</details>');
}

console.log(lines.join('\n'));
