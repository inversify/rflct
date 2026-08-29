/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DeclInfo, Edit, ResolveCallInfo } from './types.js';
import { RESOLVE_NAME } from './types.js';

export function collectResolveCall(
  node: any,
  declarations: Map<string, DeclInfo>,
  resolveCalls: ResolveCallInfo[],
  neededSymbols: Set<string>,
): void {
  const callee: any = node.callee;
  if (
    callee?.type === 'Identifier' &&
    callee.name === RESOLVE_NAME &&
    node.typeArguments
  ) {
    const typeParam: any = node.typeArguments.params?.[0];
    if (
      typeParam?.type === 'TSTypeReference' &&
      typeParam.typeName?.type === 'Identifier'
    ) {
      const typeName: string = typeParam.typeName.name;
      const decl: DeclInfo | undefined = declarations.get(typeName);
      let replacement: string;
      if (decl && decl.kind === 'class') {
        replacement = typeName;
      } else {
        neededSymbols.add(typeName);
        replacement = `__RFLCT_${typeName}`;
      }
      resolveCalls.push({ start: node.start, end: node.end, replacement });
    }
  }
}

export function emitResolveCallEdits(resolveCalls: ResolveCallInfo[]): Edit[] {
  return resolveCalls.map((call) => ({
    start: call.start,
    end: call.end,
    replacement: call.replacement,
  }));
}
