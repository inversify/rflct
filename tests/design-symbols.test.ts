import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  emitSymbolDeclarations,
  emitDesignSymbolsEdits,
} from '../dist/core/design-symbols.js';

describe('emitSymbolDeclarations', () => {
  it('emits const declarations for needed symbols', () => {
    const needed = new Set(['IFoo']);
    const decls = new Map<string, any>([
      ['IFoo', { kind: 'interface', name: 'IFoo', exported: false, end: 10 }],
    ]);
    const edits = emitSymbolDeclarations(needed, decls, '/src/test.ts', 50);
    assert.equal(edits.length, 1);
    assert.ok(edits[0]!.replacement.includes('const __RFLCT_IFoo'));
    assert.ok(edits[0]!.replacement.includes('Symbol.for('));
    assert.equal(edits[0]!.start, 50);
  });

  it('adds export keyword for exported declarations', () => {
    const needed = new Set(['IFoo']);
    const decls = new Map<string, any>([
      ['IFoo', { kind: 'interface', name: 'IFoo', exported: true, end: 10 }],
    ]);
    const edits = emitSymbolDeclarations(needed, decls, '/src/test.ts', 0);
    assert.ok(edits[0]!.replacement.includes('export const __RFLCT_IFoo'));
  });

  it('returns empty for empty neededSymbols', () => {
    const edits = emitSymbolDeclarations(new Set(), new Map(), '/test.ts', 0);
    assert.equal(edits.length, 0);
  });

  it('does not add export for unknown declarations', () => {
    const needed = new Set(['Unknown']);
    const decls = new Map<string, any>();
    const edits = emitSymbolDeclarations(needed, decls, '/test.ts', 0);
    assert.equal(edits.length, 1);
    assert.ok(edits[0]!.replacement.startsWith('const __RFLCT_Unknown'));
  });
});

describe('emitDesignSymbolsEdits', () => {
  it('emits design:symbols for top-level class declarations', () => {
    const decls = new Map<string, any>([
      ['Foo', { kind: 'class', name: 'Foo', exported: false, end: 100, topLevel: true }],
    ]);
    const edits = emitDesignSymbolsEdits(decls, new Set(), '/src/test.ts', 200);
    assert.equal(edits.length, 1);
    assert.ok(edits[0]!.replacement.includes('design:symbols'));
    assert.ok(edits[0]!.replacement.includes('Foo'));
    assert.equal(edits[0]!.start, 200);
  });

  it('emits design:symbols for needed symbols (non-class)', () => {
    const decls = new Map<string, any>([
      ['IFoo', { kind: 'interface', name: 'IFoo', exported: false, end: 50, topLevel: true }],
    ]);
    const needed = new Set(['IFoo']);
    const edits = emitDesignSymbolsEdits(decls, needed, '/src/test.ts', 100);
    assert.equal(edits.length, 1);
    assert.ok(edits[0]!.replacement.includes('__RFLCT_IFoo'));
  });

  it('skips non-top-level declarations', () => {
    const decls = new Map<string, any>([
      ['Foo', { kind: 'class', name: 'Foo', exported: false, end: 100, topLevel: false }],
    ]);
    const edits = emitDesignSymbolsEdits(decls, new Set(), '/src/test.ts', 200);
    assert.equal(edits.length, 0);
  });

  it('returns empty when no relevant declarations', () => {
    const decls = new Map<string, any>([
      ['IFoo', { kind: 'interface', name: 'IFoo', exported: false, end: 50, topLevel: true }],
    ]);
    // IFoo is an interface but not in neededSymbols
    const edits = emitDesignSymbolsEdits(decls, new Set(), '/src/test.ts', 100);
    assert.equal(edits.length, 0);
  });

  it('includes both class and needed interface symbols', () => {
    const decls = new Map<string, any>([
      ['Foo', { kind: 'class', name: 'Foo', exported: false, end: 50, topLevel: true }],
      ['IBar', { kind: 'interface', name: 'IBar', exported: false, end: 80, topLevel: true }],
    ]);
    const needed = new Set(['IBar']);
    const edits = emitDesignSymbolsEdits(decls, needed, '/src/test.ts', 200);
    assert.equal(edits.length, 1);
    assert.ok(edits[0]!.replacement.includes('Foo'));
    assert.ok(edits[0]!.replacement.includes('__RFLCT_IBar'));
  });
});
