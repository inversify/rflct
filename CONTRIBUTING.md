# Contributing

Requires Node ≥ 20.19.

```bash
npm test                   # run baseline snapshot tests
npm run baseline-accept    # accept new baselines after an intended change
```

## Tests

Baselines follow the TypeScript compiler's convention: each case is a `.ts` input
file in `tests/cases/` next to its committed `.js` snapshot output.

| File | What it is |
| --- | --- |
| `<name>.ts` | hand-written input |
| `<name>.js` | committed transformer output (snapshot) |

The test fails when the transformer output diverges from the committed snapshot.
Accept new output with `npm run baseline-accept`.
