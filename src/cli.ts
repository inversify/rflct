#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { transform } from './core/transform.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const { values: args } = parseArgs({
  options: {
    project: { type: 'string', short: 'p', default: 'tsconfig.json' },
    outDir: { type: 'string', short: 'o' },
    check: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

if (args.help) {
  console.log(`rflct — TypeScript 7 AOT metadata transformer

Usage:
  rflct -p tsconfig.json [-o outDir] [--check]

Options:
  -p, --project   Path to tsconfig.json (default: tsconfig.json)
  -o, --outDir    Output directory for transformed files
  --check         Type-check the transformed output via TS7 API
  -h, --help      Show this help
`);
  process.exit(0);
}

const tsconfigPath: string = resolve(args.project!);
if (!existsSync(tsconfigPath)) {
  console.error(`Error: tsconfig not found at ${tsconfigPath}`);
  process.exit(1);
}

interface TransformedFile {
  fileName: string;
  code: string;
}

async function main(): Promise<void> {
  const { API, SymbolFlags } = await import('typescript/unstable/sync' as any);
  const { SyntaxKind } = await import('typescript/unstable/ast' as any);

  const api = new (API as any)({ cwd: dirname(tsconfigPath) });

  try {
    const config: any = api.parseConfigFile({ fileName: tsconfigPath });
    const snapshot: any = api.updateSnapshot({
      openProjects: [{ fileName: tsconfigPath }],
    });

    try {
      const project: any = snapshot.getProject(tsconfigPath);
      if (!project) {
        console.error('Error: could not load project');
        process.exit(1);
      }

      const { program, checker } = project;
      const fileNames: string[] = program.getSourceFileNames();

      const results: TransformedFile[] = [];
      let hasErrors = false;

      for (const fileName of fileNames) {
        if (fileName.includes('node_modules')) continue;
        if (fileName.endsWith('.d.ts')) continue;

        const sourceFile: any = program.getSourceFile({ fileName });
        if (!sourceFile) continue;

        const checkerInfo: Map<string, 'class' | 'interface' | 'type'> =
          buildCheckerInfo(checker, sourceFile, SyntaxKind, SymbolFlags);

        const source: string = sourceFile.text;
        const result = transform(source, fileName, { checkerInfo });

        if (result.transformed) {
          results.push({ fileName, code: result.code });
        }
      }

      if (args.outDir) {
        const outDir: string = resolve(args.outDir);
        const projectRoot: string = dirname(tsconfigPath);
        for (const { fileName, code } of results) {
          const rel: string = relative(projectRoot, fileName);
          const outPath: string = join(outDir, rel);
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, code);
          console.log(`  ${rel}`);
        }
        console.log(
          `\n${results.length} file(s) transformed → ${relative(process.cwd(), outDir)}/`,
        );
      } else {
        if (results.length === 1) {
          process.stdout.write(results[0]!.code);
        } else {
          for (const { fileName } of results) {
            console.log(`  ${relative(dirname(tsconfigPath), fileName)}`);
          }
          console.log(
            `\n${results.length} file(s) would be transformed. Use -o to write.`,
          );
        }
      }

      if (args.check && results.length > 0) {
        console.log('\nType-checking transformed output...');
        const overlayFs: any = buildOverlayFs(results);
        const checkApi = new (API as any)({
          cwd: dirname(tsconfigPath),
          fs: overlayFs,
        });
        try {
          const checkSnapshot: any = checkApi.updateSnapshot({
            openProjects: [{ fileName: tsconfigPath }],
          });
          const checkProject: any = checkSnapshot.getProject(tsconfigPath);
          if (checkProject) {
            const diags: any[] = checkProject.program.getSemanticDiagnostics();
            if (diags.length > 0) {
              hasErrors = true;
              for (const d of diags) {
                const file: string = d.file
                  ? relative(dirname(tsconfigPath), d.file)
                  : '<unknown>';
                console.error(`${file}(${d.start}): ${d.messageText}`);
              }
            } else {
              console.log('No errors.');
            }
          }
          checkSnapshot.dispose();
        } finally {
          checkApi.close();
        }
      }

      if (hasErrors) process.exit(1);
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

function buildCheckerInfo(
  checker: any,
  sourceFile: any,
  SyntaxKind: any,
  SymbolFlags: any,
): Map<string, 'class' | 'interface' | 'type'> {
  void SymbolFlags;
  const info = new Map<string, 'class' | 'interface' | 'type'>();
  for (const statement of sourceFile.statements ?? []) {
    const kind: number = statement.kind;
    if (
      kind === SyntaxKind.ClassDeclaration ||
      kind === SyntaxKind.ClassExpression
    ) {
      const sym: any = checker.getSymbolAtLocation(statement.name ?? statement);
      if (sym) info.set(sym.name, 'class');
    } else if (kind === SyntaxKind.InterfaceDeclaration) {
      const sym: any = checker.getSymbolAtLocation(statement.name);
      if (sym) info.set(sym.name, 'interface');
    } else if (kind === SyntaxKind.TypeAliasDeclaration) {
      const sym: any = checker.getSymbolAtLocation(statement.name);
      if (sym) info.set(sym.name, 'type');
    } else if (kind === SyntaxKind.EnumDeclaration) {
      const sym: any = checker.getSymbolAtLocation(statement.name);
      if (sym) info.set(sym.name, 'class');
    }
  }
  return info;
}

function buildOverlayFs(
  transformedFiles: TransformedFile[],
): { readFile: (fileName: string) => string | undefined } {
  const map = new Map<string, string>(
    transformedFiles.map((f: TransformedFile) => [f.fileName, f.code]),
  );
  return {
    readFile(fileName: string): string | undefined {
      return map.get(fileName);
    },
  };
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
