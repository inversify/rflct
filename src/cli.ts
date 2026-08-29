#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { transform, type TransformOptions } from './core/transform.js';

const { values: args } = parseArgs({
  options: {
    project: { type: 'string', short: 'p', default: 'tsconfig.json' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: false,
});

if (args.help) {
  console.log(`rflct — drop-in replacement for tsc with AOT metadata injection

Usage:
  rflct -p tsconfig.json

Type-checks original sources via the TypeScript API, transforms .ts files
(injecting Reflect.defineMetadata calls), then emits JavaScript via tsc.
Output goes to the outDir in tsconfig. Source files are never modified.

Options:
  -p, --project   Path to tsconfig.json (default: tsconfig.json)
  -h, --help      Show this help
`);
  process.exit(0);
}

const tsconfigPath: string = resolve(args.project!);
if (!existsSync(tsconfigPath)) {
  console.error(`Error: tsconfig not found at ${tsconfigPath}`);
  process.exit(1);
}

const projectDir: string = dirname(tsconfigPath);

function lineColFromPos(text: string, pos: number): string {
  let line: number = 1;
  let lastNewline: number = 0;
  for (let i: number = 0; i < pos && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lastNewline = i + 1;
    }
  }
  return `${line},${pos - lastNewline + 1}`;
}

// Phase 1: Type-check original sources via TypeScript 7 API.
// This runs BEFORE transformation so that Reflect<T> imports are still valid.
async function typeCheck(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ts: any;
  try {
    ts = await import('typescript/unstable/sync');
  } catch {
    return; // API not available, skip — tsc will type-check during emit
  }

  const api = new ts.API();
  try {
    const snap = api.updateSnapshot({ openProject: tsconfigPath });
    try {
      const proj = snap.getProjects()[0];
      if (!proj) return;
      const prog = proj.program;
      const userFiles: string[] = prog.getSourceFileNames()
        .filter((f: string) => !prog.isSourceFileDefaultLibrary(f) && !prog.isSourceFileFromExternalLibrary(f));
      let errorCount: number = 0;
      for (const fileName of userFiles) {
        for (const d of prog.getSemanticDiagnostics(fileName)) {
          if (d.category === ts.DiagnosticCategory.Error) {
            const sf = prog.getSourceFile(fileName);
            const lc: string = lineColFromPos(sf?.text ?? '', d.pos);
            console.error(`${relative(projectDir, d.fileName)}(${lc}): error TS${d.code}: ${d.text}`);
            errorCount++;
          }
        }
      }
      if (errorCount > 0) {
        console.error(`\nFound ${errorCount} error(s).`);
        process.exit(1);
      }
    } finally {
      snap.dispose();
    }
  } finally {
    api.close();
  }
}

await typeCheck();

// Phase 2: Transform and stage
function resolveCompilerOptions(configPath: string): Record<string, unknown> {
  const raw: string = readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw) as Record<string, unknown>;
  let options: Record<string, unknown> = {};
  if (typeof config['extends'] === 'string') {
    const basePath: string = resolve(dirname(configPath), config['extends']);
    const resolved: string = basePath.endsWith('.json') ? basePath : `${basePath}.json`;
    if (existsSync(resolved)) {
      options = resolveCompilerOptions(resolved);
    }
  }
  return { ...options, ...((config['compilerOptions'] ?? {}) as Record<string, unknown>) };
}

const compilerOptions = resolveCompilerOptions(tsconfigPath);
const rootDir: string = resolve(projectDir, (compilerOptions['rootDir'] as string) ?? '.');

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full: string = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

const sourceFiles: string[] = collectTsFiles(rootDir);
const stageDir: string = join(projectDir, '.rflct');
const stageSrcDir: string = join(stageDir, 'src');

let transformedCount: number = 0;
const rflctOptions: TransformOptions = {};

for (const filePath of sourceFiles) {
  const source: string = readFileSync(filePath, 'utf8');
  const rel: string = relative(rootDir, filePath);
  const outPath: string = join(stageSrcDir, rel);
  const result = transform(source, filePath, rflctOptions);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, result.code);
  if (result.transformed) transformedCount++;
}

// Phase 3: Emit via tsc (type checking already done — errors are from stripped imports, ignore)
const wrapperTsconfig = {
  extends: tsconfigPath,
  compilerOptions: {
    rootDir: stageSrcDir,
    outDir: resolve(projectDir, (compilerOptions['outDir'] as string) ?? 'lib'),
    ...(compilerOptions['tsBuildInfoFile']
      ? { tsBuildInfoFile: resolve(projectDir, compilerOptions['tsBuildInfoFile'] as string) }
      : {}),
  },
  include: [stageSrcDir],
};

const stageTsconfigPath: string = join(stageDir, 'tsconfig.json');
writeFileSync(stageTsconfigPath, JSON.stringify(wrapperTsconfig, null, 2));

const tscBin: string = join(projectDir, 'node_modules', '.bin', 'tsc');
const tscCmd: string = existsSync(tscBin) ? tscBin : 'tsc';

try {
  execSync(`"${tscCmd}" -p "${stageTsconfigPath}"`, {
    cwd: projectDir,
    stdio: ['inherit', 'inherit', 'ignore'], // suppress stderr — type errors from stripped imports are expected
  });
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}

if (transformedCount > 0) {
  console.log(`rflct: ${transformedCount}/${sourceFiles.length} file(s) transformed`);
}
