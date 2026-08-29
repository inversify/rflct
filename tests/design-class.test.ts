import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSync } from 'oxc-parser';

import {
  collectClassMetadataAliases,
  collectClassMetadata,
  emitClassMetadataEdits,
} from '../dist/core/design-class.js';

describe('collectClassMetadataAliases', () => {
  function parseBody(code: string) {
    return parseSync('test.ts', code).program.body;
  }

  it('detects type alias resolving to Reflectable', () => {
    const code = `import { Reflectable } from 'rflct';\ntype Injectable = Reflectable<{ scope: 'singleton' }>;`;
    const body = parseBody(code);
    const markerImports = new Set(['Reflectable']);
    const aliases = collectClassMetadataAliases(body, markerImports);
    assert.equal(aliases.size, 1);
    assert.ok(aliases.has('Injectable'));
  });

  it('detects exported type alias', () => {
    const code = `import { Reflectable } from 'rflct';\nexport type Injectable = Reflectable<{ scope: 'singleton' }>;`;
    const body = parseBody(code);
    const markerImports = new Set(['Reflectable']);
    const aliases = collectClassMetadataAliases(body, markerImports);
    assert.equal(aliases.size, 1);
    assert.ok(aliases.has('Injectable'));
  });

  it('returns empty when Reflectable not imported', () => {
    const code = `type Injectable = Reflectable<{ scope: 'singleton' }>;`;
    const body = parseBody(code);
    const markerImports = new Set<string>();
    const aliases = collectClassMetadataAliases(body, markerImports);
    assert.equal(aliases.size, 0);
  });

  it('ignores type aliases not referencing Reflectable', () => {
    const code = `import { Reflectable } from 'rflct';\ntype Foo = string;`;
    const body = parseBody(code);
    const markerImports = new Set(['Reflectable']);
    const aliases = collectClassMetadataAliases(body, markerImports);
    assert.equal(aliases.size, 0);
  });
});

describe('collectClassMetadata', () => {
  function parseClass(code: string) {
    const result = parseSync('test.ts', code);
    return result.program.body.find((n: any) => n.type === 'ClassDeclaration');
  }

  it('collects metadata from Reflectable implements', () => {
    const code = `import { Reflectable } from 'rflct';\nclass Foo implements Reflectable<{ tag: 'x' }> {}`;
    const classNode = parseClass(code);
    const markerImports = new Set(['Reflectable']);
    const list: any[] = [];
    collectClassMetadata(classNode, code, markerImports, new Map(), list);
    assert.equal(list.length, 1);
    assert.equal(list[0].className, 'Foo');
    assert.ok(list[0].metadataExpr.includes('tag'));
  });

  it('uses empty object when no type argument', () => {
    const code = `import { Reflectable } from 'rflct';\nclass Foo implements Reflectable {}`;
    const classNode = parseClass(code);
    const markerImports = new Set(['Reflectable']);
    const list: any[] = [];
    collectClassMetadata(classNode, code, markerImports, new Map(), list);
    assert.equal(list.length, 1);
    assert.equal(list[0].metadataExpr, '{}');
  });

  it('collects metadata from classMetadataAliasSet', () => {
    const code = `import { Injectable } from 'my-di';\nclass Foo implements Injectable {}`;
    const classNode = parseClass(code);
    const markerImports = new Set(['Injectable']);
    const aliasSet = new Set(['Injectable']);
    const list: any[] = [];
    collectClassMetadata(classNode, code, markerImports, new Map(), list, aliasSet);
    assert.equal(list.length, 1);
    assert.equal(list[0].metadataExpr, '{}');
  });

  it('collects metadata from same-file type alias', () => {
    const code = `class Foo implements MyInjectable {}`;
    const classNode = parseClass(code);
    // Simulate a type alias that resolves to Reflectable<{ scope: 'request' }>
    const aliasMap = new Map<string, any>([['MyInjectable', null]]);
    const list: any[] = [];
    collectClassMetadata(classNode, code, new Set(), aliasMap, list);
    assert.equal(list.length, 1);
    assert.equal(list[0].metadataExpr, '{}');
  });

  it('skips class without id', () => {
    const classNode = { id: null, body: { body: [] }, end: 10 };
    const list: any[] = [];
    collectClassMetadata(classNode, '', new Set(), new Map(), list);
    assert.equal(list.length, 0);
  });

  it('skips class without implements', () => {
    const code = `class Foo {}`;
    const classNode = parseClass(code);
    const list: any[] = [];
    collectClassMetadata(classNode, code, new Set(), new Map(), list);
    assert.equal(list.length, 0);
  });

  it('uses scopeEnd as insert position when provided', () => {
    const code = `import { Reflectable } from 'rflct';\nclass Foo implements Reflectable<{ x: 1 }> {}`;
    const classNode = parseClass(code);
    const markerImports = new Set(['Reflectable']);
    const list: any[] = [];
    collectClassMetadata(classNode, code, markerImports, new Map(), list, undefined, 999);
    assert.equal(list[0].insertAfter, 999);
  });
});

describe('emitClassMetadataEdits', () => {
  it('emits design:class Reflect.defineMetadata calls', () => {
    const list = [
      { className: 'Foo', metadataExpr: '{ tag: "x" }', insertAfter: 100 },
    ];
    const edits = emitClassMetadataEdits(list);
    assert.equal(edits.length, 1);
    assert.ok(edits[0]!.replacement.includes('design:class'));
    assert.ok(edits[0]!.replacement.includes('{ tag: "x" }'));
    assert.ok(edits[0]!.replacement.includes('Foo'));
    assert.equal(edits[0]!.start, 100);
    assert.equal(edits[0]!.end, 100);
  });

  it('returns empty for empty list', () => {
    assert.equal(emitClassMetadataEdits([]).length, 0);
  });

  it('emits multiple edits for multiple classes', () => {
    const list = [
      { className: 'A', metadataExpr: '{}', insertAfter: 50 },
      { className: 'B', metadataExpr: '{}', insertAfter: 100 },
    ];
    const edits = emitClassMetadataEdits(list);
    assert.equal(edits.length, 2);
  });
});
