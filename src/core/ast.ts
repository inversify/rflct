/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DeclInfo, Edit } from './types.js';
import { PACKAGE_NAMES } from './types.js';

export function isPackageImport(src: string): boolean {
  return PACKAGE_NAMES.some(
    (name: string) => src === name || src.startsWith(name + '/'),
  );
}

export function extractDecl(node: any): DeclInfo | null {
  const exported: boolean = hasExportKeyword(node);
  let inner: any = node;
  if (node.type === 'ExportNamedDeclaration' && node.declaration) {
    inner = node.declaration;
  }
  if (node.type === 'ExportDefaultDeclaration' && node.declaration) {
    inner = node.declaration;
  }
  switch (inner.type) {
    case 'ClassDeclaration':
      if (inner.id)
        return { name: inner.id.name, kind: 'class', exported, end: node.end };
      break;
    case 'TSInterfaceDeclaration':
      return { name: inner.id.name, kind: 'interface', exported, end: node.end };
    case 'TSTypeAliasDeclaration':
      return { name: inner.id.name, kind: 'type', exported, end: node.end };
    case 'TSEnumDeclaration':
      return { name: inner.id.name, kind: 'class', exported, end: node.end };
  }
  return null;
}

export function hasExportKeyword(node: any): boolean {
  return (
    node.type === 'ExportNamedDeclaration' ||
    node.type === 'ExportDefaultDeclaration'
  );
}

export function collectBlockDeclarations(statements: any[]): Map<string, DeclInfo> {
  const decls = new Map<string, DeclInfo>();
  if (!statements) return decls;
  for (const stmt of statements) {
    if (stmt.type === 'ClassDeclaration' && stmt.id?.name) {
      decls.set(stmt.id.name, { kind: 'class', name: stmt.id.name, exported: false, end: stmt.end, topLevel: false });
    } else if (stmt.type === 'TSInterfaceDeclaration' && stmt.id?.name) {
      decls.set(stmt.id.name, { kind: 'interface', name: stmt.id.name, exported: false, end: stmt.end, topLevel: false });
    } else if (stmt.type === 'TSTypeAliasDeclaration' && stmt.id?.name) {
      decls.set(stmt.id.name, { kind: 'type', name: stmt.id.name, exported: false, end: stmt.end, topLevel: false });
    }
  }
  return decls;
}

export function walkAllNodesWithScope(
  nodes: any[],
  scopeEnd: number,
  visitor: (node: any, scopeEnd: number, scopeDecls: Map<string, DeclInfo>) => void,
  scopeDecls: Map<string, DeclInfo> = new Map(),
): void {
  for (const node of nodes) {
    walkNodeWithScope(node, scopeEnd, visitor, scopeDecls);
  }
}

function walkNodeWithScope(
  node: any,
  scopeEnd: number,
  visitor: (node: any, scopeEnd: number, scopeDecls: Map<string, DeclInfo>) => void,
  scopeDecls: Map<string, DeclInfo>,
): void {
  if (!node || typeof node !== 'object') return;
  let childScopeEnd: number = scopeEnd;
  let childDecls: Map<string, DeclInfo> = scopeDecls;
  if (
    (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'FunctionDeclaration') &&
    node.body?.type === 'BlockStatement'
  ) {
    childScopeEnd = node.body.end - 1;
    const localDecls: Map<string, DeclInfo> = collectBlockDeclarations(node.body.body);
    if (localDecls.size > 0) {
      childDecls = new Map([...scopeDecls, ...localDecls]);
    }
  }
  if (node.type) visitor(node, childScopeEnd, childDecls);
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'type') continue;
    const child: any = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) {
          walkNodeWithScope(item, childScopeEnd, visitor, childDecls);
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkNodeWithScope(child, childScopeEnd, visitor, childDecls);
    }
  }
}

export function findFirstNonImport(body: any[]): number {
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') return node.start;
  }
  return 0;
}

export function applyEdits(source: string, edits: Edit[]): string {
  edits.sort((a: Edit, b: Edit) => b.start - a.start || b.end - a.end);
  let result: string = source;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }
  return result;
}
