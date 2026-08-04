import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// The README's macro tables are generated from the macro definitions. This is
// what stops them drifting back into a hand-maintained second copy.
test('README macro tables match the macro definitions', () => {
    try {
        execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-readme.js'), '--check'], {
            cwd: ROOT,
            stdio: 'pipe',
        });
    } catch (error) {
        const detail = `${error.stderr ?? ''}${error.stdout ?? ''}`.trim();
        assert.fail(`README.md is out of date — run \`npm run docs\`.\n${detail}`);
    }
});
