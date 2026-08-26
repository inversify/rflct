// Runtime fallback for `resolve<T>()`.
// Every `resolve<T>()` call is replaced at compile time by the transformer.
// If this function is reached, the transformer did not run.
const message = 'rflct: `resolve<T>()` was called but never replaced at compile time. ' +
    'Ensure the build plugin is configured (unplugin for Vite/Rollup/webpack, or the CLI for tsgo).';
export function resolve() {
    throw new Error(message);
}
