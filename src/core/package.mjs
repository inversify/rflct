import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const cache = new Map();

export function nearestPackage(fileName) {
  let directory = dirname(fileName);
  const visited = [];
  for (;;) {
    if (cache.has(directory)) {
      const found = cache.get(directory);
      for (const seen of visited) cache.set(seen, found);
      return found;
    }
    visited.push(directory);
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      let found = { name: "", major: "", root: directory };
      try {
        const parsed = JSON.parse(readFileSync(manifest, "utf8"));
        found = {
          name: parsed.name ?? "",
          major: String(parsed.version ?? "").split(".")[0] ?? "",
          root: directory,
        };
      } catch {}
      for (const seen of visited) cache.set(seen, found);
      return found;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      for (const seen of visited) cache.set(seen, null);
      return null;
    }
    directory = parent;
  }
}

export function qualifiedName(fileName, typeName) {
  const pkg = nearestPackage(fileName);
  const rel = pkg
    ? relative(pkg.root, fileName).split(sep).join("/")
    : fileName;
  return `${pkg?.name ?? ""}@${pkg?.major ?? ""}|${rel}|${typeName}`;
}
