/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DeclInfo, Edit } from './types.js';
import { qualifiedName } from './package.js';

export function emitSymbolDeclarations(
  neededSymbols: Set<string>,
  declarations: Map<string, DeclInfo>,
  fileName: string,
  insertPos: number,
): Edit[] {
  const symbolDecls: string[] = [];
  for (const name of neededSymbols) {
    const qn: string = qualifiedName(fileName, name);
    const decl: DeclInfo | undefined = declarations.get(name);
    const exp: string = decl?.exported ? 'export ' : '';
    symbolDecls.push(`${exp}const __RFLCT_${name} = Symbol.for(${JSON.stringify(qn)});`);
  }
  if (symbolDecls.length === 0) return [];
  return [{
    start: insertPos,
    end: insertPos,
    replacement: symbolDecls.join('\n') + '\n',
  }];
}

export function emitDesignSymbolsEdits(
  declarations: Map<string, DeclInfo>,
  neededSymbols: Set<string>,
  fileName: string,
  sourceLength: number,
): Edit[] {
  const symbolEntries: string[] = [];
  for (const [name, info] of declarations) {
    if (!info.topLevel) continue;
    if (info.kind === 'class' || neededSymbols.has(name)) {
      const qn: string = qualifiedName(fileName, name);
      const value: string = info.kind === 'class' ? name : `__RFLCT_${name}`;
      symbolEntries.push(`  ${JSON.stringify(qn)}: ${value}`);
    }
  }
  if (symbolEntries.length === 0) return [];
  const map = `{\n${symbolEntries.join(',\n')}\n}`;
  const injection = `\nReflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, ${map}), Reflect);\n`;
  return [{ start: sourceLength, end: sourceLength, replacement: injection }];
}
