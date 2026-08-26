const message =
  'rflct: `resolve<T>()` was called but never replaced at compile time. ' +
  'Ensure the build plugin is configured (unplugin for Vite/Rollup/webpack, or the CLI for tsgo).';

export function resolve(): never {
  throw new Error(message);
}
