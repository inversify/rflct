import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

interface PackageInfo {
  name: string;
  major: string;
  root: string;
}

const cache = new Map<string, PackageInfo | null>();

export function nearestPackage(fileName: string): PackageInfo | null {
  let directory: string = dirname(fileName);
  const visited: string[] = [];
  for (;;) {
    if (cache.has(directory)) {
      const found: PackageInfo | null = cache.get(directory)!;
      for (const seen of visited) cache.set(seen, found);
      return found;
    }
    visited.push(directory);
    const manifest: string = join(directory, 'package.json');
    if (existsSync(manifest)) {
      let found: PackageInfo = { name: '', major: '', root: directory };
      try {
        const parsed: { name?: string; version?: string } = JSON.parse(
          readFileSync(manifest, 'utf8'),
        );
        found = {
          name: parsed.name ?? '',
          major: String(parsed.version ?? '').split('.')[0] ?? '',
          root: directory,
        };
      } catch {
        // ignore malformed package.json
      }
      for (const seen of visited) cache.set(seen, found);
      return found;
    }
    const parent: string = dirname(directory);
    if (parent === directory) {
      for (const seen of visited) cache.set(seen, null);
      return null;
    }
    directory = parent;
  }
}

export function qualifiedName(fileName: string, typeName: string): string {
  const pkg: PackageInfo | null = nearestPackage(fileName);
  const rel: string = pkg
    ? relative(pkg.root, fileName).split(sep).join('/')
    : fileName;
  return `${pkg?.name ?? ''}@${pkg?.major ?? ''}|${rel}|${typeName}`;
}
