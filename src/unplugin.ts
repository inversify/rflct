import { createUnplugin } from 'unplugin';

import { transform, type TransformOptions } from './core/transform.js';

const PLUGIN_NAME = 'rflct';
const TS_RE = /\.[cm]?tsx?$/;

export const unplugin = createUnplugin((options?: TransformOptions) => {
  const include: RegExp = options?.include ?? TS_RE;
  const exclude: RegExp = options?.exclude ?? /node_modules/;

  return {
    name: PLUGIN_NAME,
    enforce: 'pre' as const,

    transformInclude(id: string): boolean {
      if (exclude.test(id)) return false;
      return include.test(id);
    },

    transform(source: string, id: string) {
      const result = transform(source, id, options);
      if (!result.transformed) return null;
      return { code: result.code, map: null };
    },
  };
});

export const vitePlugin = unplugin.vite;
export const rollupPlugin = unplugin.rollup;
export const webpackPlugin = unplugin.webpack;
export const esbuildPlugin = unplugin.esbuild;

export default unplugin;
