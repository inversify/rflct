import { createUnplugin } from "unplugin";
import { transform } from "./core/transform.mjs";

const PLUGIN_NAME = "rflct";
const TS_RE = /\.[cm]?tsx?$/;

export const unplugin = createUnplugin((options) => {
  const include = options?.include ?? TS_RE;
  const exclude = options?.exclude ?? /node_modules/;

  return {
    name: PLUGIN_NAME,
    enforce: "pre",

    transformInclude(id) {
      if (exclude instanceof RegExp && exclude.test(id)) return false;
      if (include instanceof RegExp) return include.test(id);
      return true;
    },

    transform(source, id) {
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
