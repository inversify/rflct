#!/usr/bin/env node
// CLI wrapper that uses the TypeScript 7 API to:
// 1. Load the project from tsconfig.json
// 2. Use the checker to determine class vs interface/type
// 3. Transform source files with accurate type resolution
// 4. Write transformed output (or feed back through VFS for type-checking)

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { transform } from "./core/transform.mjs";

const { values: args, positionals } = parseArgs({
  options: {
    project: { type: "string", short: "p", default: "tsconfig.json" },
    outDir: { type: "string", short: "o" },
    check: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
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

const tsconfigPath = resolve(args.project);
if (!existsSync(tsconfigPath)) {
  console.error(`Error: tsconfig not found at ${tsconfigPath}`);
  process.exit(1);
}

async function main() {
  const { API, SymbolFlags } = await import("typescript/unstable/sync");
  const { SyntaxKind } = await import("typescript/unstable/ast");

  const api = new API({ cwd: dirname(tsconfigPath) });

  try {
    const config = api.parseConfigFile({ fileName: tsconfigPath });
    const snapshot = api.updateSnapshot({ openProjects: [{ fileName: tsconfigPath }] });

    try {
      const project = snapshot.getProject(tsconfigPath);
      if (!project) {
        console.error("Error: could not load project");
        process.exit(1);
      }

      const { program, checker } = project;
      const fileNames = program.getSourceFileNames();

      // Build checker info: for each file, resolve symbols to class/interface/type.
      const results = [];
      let hasErrors = false;

      for (const fileName of fileNames) {
        if (fileName.includes("node_modules")) continue;
        if (fileName.endsWith(".d.ts")) continue;

        const sourceFile = program.getSourceFile({ fileName });
        if (!sourceFile) continue;

        // Use checker to build a map of declared names → kinds.
        const checkerInfo = buildCheckerInfo(checker, sourceFile, SyntaxKind, SymbolFlags);

        const source = sourceFile.text;
        const result = transform(source, fileName, { checkerInfo });

        if (result.transformed) {
          results.push({ fileName, code: result.code });
        }
      }

      // Write output.
      if (args.outDir) {
        const outDir = resolve(args.outDir);
        const projectRoot = dirname(tsconfigPath);
        for (const { fileName, code } of results) {
          const rel = relative(projectRoot, fileName);
          const outPath = join(outDir, rel);
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, code);
          console.log(`  ${rel}`);
        }
        console.log(`\n${results.length} file(s) transformed → ${relative(process.cwd(), outDir)}/`);
      } else {
        // Print to stdout if single file, otherwise just report.
        if (results.length === 1) {
          process.stdout.write(results[0].code);
        } else {
          for (const { fileName } of results) {
            console.log(`  ${relative(dirname(tsconfigPath), fileName)}`);
          }
          console.log(`\n${results.length} file(s) would be transformed. Use -o to write.`);
        }
      }

      // Type-check if requested.
      if (args.check && results.length > 0) {
        console.log("\nType-checking transformed output...");
        // Feed transformed files back through VFS overlay.
        const overlayFs = buildOverlayFs(results);
        const checkApi = new API({ cwd: dirname(tsconfigPath), fs: overlayFs });
        try {
          const checkSnapshot = checkApi.updateSnapshot({ openProjects: [{ fileName: tsconfigPath }] });
          const checkProject = checkSnapshot.getProject(tsconfigPath);
          if (checkProject) {
            const diags = checkProject.program.getSemanticDiagnostics();
            if (diags.length > 0) {
              hasErrors = true;
              for (const d of diags) {
                const file = d.file ? relative(dirname(tsconfigPath), d.file) : "<unknown>";
                console.error(`${file}(${d.start}): ${d.messageText}`);
              }
            } else {
              console.log("No errors.");
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

function buildCheckerInfo(checker, sourceFile, SyntaxKind, SymbolFlags) {
  const info = new Map();
  // Walk top-level statements and resolve their symbols.
  for (const statement of sourceFile.statements ?? []) {
    const kind = statement.kind;
    if (kind === SyntaxKind.ClassDeclaration || kind === SyntaxKind.ClassExpression) {
      const sym = checker.getSymbolAtLocation(statement.name ?? statement);
      if (sym) info.set(sym.name, "class");
    } else if (kind === SyntaxKind.InterfaceDeclaration) {
      const sym = checker.getSymbolAtLocation(statement.name);
      if (sym) info.set(sym.name, "interface");
    } else if (kind === SyntaxKind.TypeAliasDeclaration) {
      const sym = checker.getSymbolAtLocation(statement.name);
      if (sym) info.set(sym.name, "type");
    } else if (kind === SyntaxKind.EnumDeclaration) {
      const sym = checker.getSymbolAtLocation(statement.name);
      if (sym) info.set(sym.name, "class");
    }
  }
  return info;
}

function buildOverlayFs(transformedFiles) {
  const map = new Map(transformedFiles.map((f) => [f.fileName, f.code]));
  return {
    readFile(fileName) {
      if (map.has(fileName)) return map.get(fileName);
      return undefined; // fall back to real FS
    },
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
