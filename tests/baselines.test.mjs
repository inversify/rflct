// Baseline snapshot tests, TypeScript-compiler style.
//
// Each case is a `.ts` input file in tests/cases/. The expected output is committed
// as a `.js` file next to it. The test fails when the transformer output diverges
// from the committed snapshot.
//
// Accept new baselines with:  npm run baseline-accept

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { transform } from "../src/core/transform.mjs";

const casesDir = join(import.meta.dirname, "cases");
const accepting = process.env.ACCEPT_BASELINES === "1";

const cases = readdirSync(casesDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .map((f) => f.replace(/\.ts$/, ""))
  .sort();

assert.ok(cases.length > 0, "no test cases found in tests/cases/");

for (const name of cases) {
  describe(name, () => {
    it("matches baseline snapshot", () => {
      const inputPath = join(casesDir, `${name}.ts`);
      const baselinePath = join(casesDir, `${name}.js`);
      const source = readFileSync(inputPath, "utf8");

      const result = transform(source, inputPath);
      const actual = result.transformed ? result.code : source;

      if (accepting) {
        writeFileSync(baselinePath, actual);
        return;
      }

      assert.ok(
        existsSync(baselinePath),
        `Missing baseline ${name}.js — accept with: npm run baseline-accept`,
      );
      const expected = readFileSync(baselinePath, "utf8");
      assert.equal(
        actual,
        expected,
        `${name}.js does not match. Review the diff, then: npm run baseline-accept`,
      );
    });
  });
}
