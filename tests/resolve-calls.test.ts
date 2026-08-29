import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectResolveCall,
  emitResolveCallEdits,
} from '../dist/core/resolve-calls.js';

describe('collectResolveCall', () => {
  it('collects resolve call for class type', () => {
    const node = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'resolve' },
      typeArguments: {
        params: [
          { type: 'TSTypeReference', typeName: { type: 'Identifier', name: 'Foo' } },
        ],
      },
      start: 10,
      end: 30,
    };
    const decls = new Map<string, any>([
      ['Foo', { kind: 'class', name: 'Foo', exported: false, end: 100 }],
    ]);
    const calls: any[] = [];
    const needed = new Set<string>();
    collectResolveCall(node, decls, calls, needed);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].replacement, 'Foo');
    assert.equal(needed.size, 0);
  });

  it('collects resolve call for interface type with __RFLCT_ prefix', () => {
    const node = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'resolve' },
      typeArguments: {
        params: [
          { type: 'TSTypeReference', typeName: { type: 'Identifier', name: 'IFoo' } },
        ],
      },
      start: 10,
      end: 30,
    };
    const decls = new Map<string, any>([
      ['IFoo', { kind: 'interface', name: 'IFoo', exported: false, end: 50 }],
    ]);
    const calls: any[] = [];
    const needed = new Set<string>();
    collectResolveCall(node, decls, calls, needed);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].replacement, '__RFLCT_IFoo');
    assert.ok(needed.has('IFoo'));
  });

  it('adds unknown type to neededSymbols', () => {
    const node = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'resolve' },
      typeArguments: {
        params: [
          { type: 'TSTypeReference', typeName: { type: 'Identifier', name: 'Unknown' } },
        ],
      },
      start: 0,
      end: 20,
    };
    const decls = new Map<string, any>();
    const calls: any[] = [];
    const needed = new Set<string>();
    collectResolveCall(node, decls, calls, needed);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].replacement, '__RFLCT_Unknown');
    assert.ok(needed.has('Unknown'));
  });

  it('ignores non-resolve callee', () => {
    const node = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'other' },
      typeArguments: { params: [] },
      start: 0,
      end: 10,
    };
    const calls: any[] = [];
    collectResolveCall(node, new Map(), calls, new Set());
    assert.equal(calls.length, 0);
  });

  it('ignores resolve call without typeArguments', () => {
    const node = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'resolve' },
      start: 0,
      end: 10,
    };
    const calls: any[] = [];
    collectResolveCall(node, new Map(), calls, new Set());
    assert.equal(calls.length, 0);
  });

  it('ignores resolve call with non-TSTypeReference param', () => {
    const node = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'resolve' },
      typeArguments: {
        params: [{ type: 'TSStringKeyword' }],
      },
      start: 0,
      end: 10,
    };
    const calls: any[] = [];
    collectResolveCall(node, new Map(), calls, new Set());
    assert.equal(calls.length, 0);
  });

  it('ignores resolve call with non-Identifier callee', () => {
    const node = {
      type: 'CallExpression',
      callee: { type: 'MemberExpression', object: { name: 'a' }, property: { name: 'resolve' } },
      typeArguments: { params: [] },
      start: 0,
      end: 10,
    };
    const calls: any[] = [];
    collectResolveCall(node, new Map(), calls, new Set());
    assert.equal(calls.length, 0);
  });
});

describe('emitResolveCallEdits', () => {
  it('maps resolve calls to edits', () => {
    const calls = [
      { start: 10, end: 30, replacement: 'Foo' },
      { start: 50, end: 70, replacement: '__RFLCT_IBar' },
    ];
    const edits = emitResolveCallEdits(calls);
    assert.equal(edits.length, 2);
    assert.deepEqual(edits[0], { start: 10, end: 30, replacement: 'Foo' });
    assert.deepEqual(edits[1], { start: 50, end: 70, replacement: '__RFLCT_IBar' });
  });

  it('returns empty for empty calls', () => {
    assert.equal(emitResolveCallEdits([]).length, 0);
  });
});
