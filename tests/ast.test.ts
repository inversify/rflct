import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isPackageImport,
  extractDecl,
  hasExportKeyword,
  collectBlockDeclarations,
  findFirstNonImport,
  applyEdits,
} from '../dist/core/ast.js';

describe('isPackageImport', () => {
  it('returns true for exact package name', () => {
    assert.equal(isPackageImport('rflct'), true);
  });

  it('returns true for sub-path import', () => {
    assert.equal(isPackageImport('rflct/transform'), true);
  });

  it('returns false for unrelated package', () => {
    assert.equal(isPackageImport('lodash'), false);
  });

  it('returns false for prefix-matching but not sub-path', () => {
    assert.equal(isPackageImport('rflctx'), false);
  });

  it('returns false for empty string', () => {
    assert.equal(isPackageImport(''), false);
  });
});

describe('hasExportKeyword', () => {
  it('returns true for ExportNamedDeclaration', () => {
    assert.equal(hasExportKeyword({ type: 'ExportNamedDeclaration' }), true);
  });

  it('returns true for ExportDefaultDeclaration', () => {
    assert.equal(hasExportKeyword({ type: 'ExportDefaultDeclaration' }), true);
  });

  it('returns false for ClassDeclaration', () => {
    assert.equal(hasExportKeyword({ type: 'ClassDeclaration' }), false);
  });
});

describe('extractDecl', () => {
  it('extracts ClassDeclaration', () => {
    const node = { type: 'ClassDeclaration', id: { name: 'Foo' }, end: 100 };
    const result = extractDecl(node);
    assert.deepEqual(result, { name: 'Foo', kind: 'class', exported: false, end: 100 });
  });

  it('extracts exported ClassDeclaration', () => {
    const node = {
      type: 'ExportNamedDeclaration',
      declaration: { type: 'ClassDeclaration', id: { name: 'Foo' }, end: 90 },
      end: 100,
    };
    const result = extractDecl(node);
    assert.deepEqual(result, { name: 'Foo', kind: 'class', exported: true, end: 100 });
  });

  it('extracts TSInterfaceDeclaration', () => {
    const node = { type: 'TSInterfaceDeclaration', id: { name: 'IFoo' }, end: 50 };
    const result = extractDecl(node);
    assert.deepEqual(result, { name: 'IFoo', kind: 'interface', exported: false, end: 50 });
  });

  it('extracts TSTypeAliasDeclaration', () => {
    const node = { type: 'TSTypeAliasDeclaration', id: { name: 'MyType' }, end: 30 };
    const result = extractDecl(node);
    assert.deepEqual(result, { name: 'MyType', kind: 'type', exported: false, end: 30 });
  });

  it('extracts TSEnumDeclaration as class kind', () => {
    const node = { type: 'TSEnumDeclaration', id: { name: 'Dir' }, end: 40 };
    const result = extractDecl(node);
    assert.deepEqual(result, { name: 'Dir', kind: 'class', exported: false, end: 40 });
  });

  it('extracts default-exported ClassDeclaration', () => {
    const node = {
      type: 'ExportDefaultDeclaration',
      declaration: { type: 'ClassDeclaration', id: { name: 'Bar' }, end: 60 },
      end: 70,
    };
    const result = extractDecl(node);
    assert.deepEqual(result, { name: 'Bar', kind: 'class', exported: true, end: 70 });
  });

  it('returns null for ClassDeclaration without id', () => {
    const node = { type: 'ClassDeclaration', id: null, end: 10 };
    assert.equal(extractDecl(node), null);
  });

  it('returns null for VariableDeclaration', () => {
    const node = { type: 'VariableDeclaration', end: 20 };
    assert.equal(extractDecl(node), null);
  });
});

describe('collectBlockDeclarations', () => {
  it('collects class, interface, and type declarations', () => {
    const stmts = [
      { type: 'ClassDeclaration', id: { name: 'A' }, end: 10 },
      { type: 'TSInterfaceDeclaration', id: { name: 'B' }, end: 20 },
      { type: 'TSTypeAliasDeclaration', id: { name: 'C' }, end: 30 },
      { type: 'VariableDeclaration', end: 40 },
    ];
    const decls = collectBlockDeclarations(stmts);
    assert.equal(decls.size, 3);
    assert.equal(decls.get('A')!.kind, 'class');
    assert.equal(decls.get('B')!.kind, 'interface');
    assert.equal(decls.get('C')!.kind, 'type');
  });

  it('returns empty map for null input', () => {
    const decls = collectBlockDeclarations(null as any);
    assert.equal(decls.size, 0);
  });

  it('returns empty map for empty array', () => {
    const decls = collectBlockDeclarations([]);
    assert.equal(decls.size, 0);
  });

  it('skips declarations without id.name', () => {
    const stmts = [
      { type: 'ClassDeclaration', id: null, end: 10 },
    ];
    const decls = collectBlockDeclarations(stmts);
    assert.equal(decls.size, 0);
  });
});

describe('findFirstNonImport', () => {
  it('returns start of first non-import node', () => {
    const body = [
      { type: 'ImportDeclaration', start: 0 },
      { type: 'ImportDeclaration', start: 30 },
      { type: 'ClassDeclaration', start: 60 },
    ];
    assert.equal(findFirstNonImport(body), 60);
  });

  it('returns 0 when all nodes are imports', () => {
    const body = [
      { type: 'ImportDeclaration', start: 0 },
    ];
    assert.equal(findFirstNonImport(body), 0);
  });

  it('returns start of first node when no imports', () => {
    const body = [
      { type: 'ClassDeclaration', start: 5 },
    ];
    assert.equal(findFirstNonImport(body), 5);
  });

  it('returns 0 for empty body', () => {
    assert.equal(findFirstNonImport([]), 0);
  });
});

describe('applyEdits', () => {
  it('applies a single insertion', () => {
    const result = applyEdits('hello world', [
      { start: 5, end: 5, replacement: ' beautiful' },
    ]);
    assert.equal(result, 'hello beautiful world');
  });

  it('applies a single replacement', () => {
    const result = applyEdits('hello world', [
      { start: 6, end: 11, replacement: 'earth' },
    ]);
    assert.equal(result, 'hello earth');
  });

  it('applies multiple edits in correct order', () => {
    const result = applyEdits('abcdef', [
      { start: 0, end: 1, replacement: 'A' },
      { start: 5, end: 6, replacement: 'F' },
    ]);
    assert.equal(result, 'AbcdeF');
  });

  it('applies a deletion', () => {
    const result = applyEdits('hello world', [
      { start: 5, end: 6, replacement: '' },
    ]);
    assert.equal(result, 'helloworld');
  });

  it('handles empty edits array', () => {
    assert.equal(applyEdits('unchanged', []), 'unchanged');
  });
});
