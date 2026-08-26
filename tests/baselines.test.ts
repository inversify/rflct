import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { transform } from '../dist/core/transform.js';

const casesDir: string = join(import.meta.dirname, 'cases');
const accepting: boolean = process.env.ACCEPT_BASELINES === '1';

const cases: string[] = readdirSync(casesDir)
  .filter((f: string) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  .map((f: string) => f.replace(/\.ts$/, ''))
  .sort();

assert.ok(cases.length > 0, 'no test cases found in tests/cases/');

for (const name of cases) {
  describe(name, () => {
    it('matches baseline snapshot', () => {
      const inputPath: string = join(casesDir, `${name}.ts`);
      const baselinePath: string = join(casesDir, `${name}.js`);
      const source: string = readFileSync(inputPath, 'utf8');

      const result = transform(source, inputPath);
      const actual: string = result.transformed ? result.code : source;

      if (accepting) {
        writeFileSync(baselinePath, actual);
        return;
      }

      assert.ok(
        existsSync(baselinePath),
        `Missing baseline ${name}.js — accept with: npm run baseline-accept`,
      );
      const expected: string = readFileSync(baselinePath, 'utf8');
      assert.equal(
        actual,
        expected,
        `${name}.js does not match. Review the diff, then: npm run baseline-accept`,
      );
    });
  });
}
