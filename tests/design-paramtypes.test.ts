import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSync } from 'oxc-parser';

import {
  unwrapParam,
  trackNeededSymbol,
  buildAliasMetadata,
  serializeLiteralType,
  emitParamtypesEdits,
  emitPropertiesEdits,
  collectClassReflections,
  buildParamEntry,
} from '../dist/core/design-paramtypes.js';

describe('unwrapParam', () => {
  it('returns plain param as-is', () => {
    const param = { type: 'Identifier', name: 'x' };
    assert.equal(unwrapParam(param), param);
  });

  it('unwraps TSParameterProperty', () => {
    const inner = { type: 'Identifier', name: 'x' };
    const param = { type: 'TSParameterProperty', parameter: inner };
    assert.equal(unwrapParam(param), inner);
  });

  it('unwraps AssignmentPattern to left side', () => {
    const left = { type: 'Identifier', name: 'x' };
    const param = { type: 'AssignmentPattern', left, right: { type: 'Literal', value: 5 } };
    assert.equal(unwrapParam(param), left);
  });

  it('unwraps nested TSParameterProperty with AssignmentPattern', () => {
    const left = { type: 'Identifier', name: 'x' };
    const param = {
      type: 'TSParameterProperty',
      parameter: { type: 'AssignmentPattern', left, right: { type: 'Literal', value: 5 } },
    };
    assert.equal(unwrapParam(param), left);
  });
});

describe('trackNeededSymbol', () => {
  it('adds interface-kind declaration to neededSymbols', () => {
    const decls = new Map([['IFoo', { kind: 'interface', name: 'IFoo', exported: false, end: 10 }]]);
    const needed = new Set<string>();
    trackNeededSymbol(
      { type: 'TSTypeReference', typeName: { name: 'IFoo' } },
      decls as any,
      needed,
    );
    assert.ok(needed.has('IFoo'));
  });

  it('adds type-kind declaration to neededSymbols', () => {
    const decls = new Map([['MyType', { kind: 'type', name: 'MyType', exported: false, end: 10 }]]);
    const needed = new Set<string>();
    trackNeededSymbol(
      { type: 'TSTypeReference', typeName: { name: 'MyType' } },
      decls as any,
      needed,
    );
    assert.ok(needed.has('MyType'));
  });

  it('does not add class-kind declaration', () => {
    const decls = new Map([['Foo', { kind: 'class', name: 'Foo', exported: false, end: 10 }]]);
    const needed = new Set<string>();
    trackNeededSymbol(
      { type: 'TSTypeReference', typeName: { name: 'Foo' } },
      decls as any,
      needed,
    );
    assert.equal(needed.size, 0);
  });

  it('ignores non-TSTypeReference nodes', () => {
    const decls = new Map([['IFoo', { kind: 'interface', name: 'IFoo', exported: false, end: 10 }]]);
    const needed = new Set<string>();
    trackNeededSymbol({ type: 'TSStringKeyword' }, decls as any, needed);
    assert.equal(needed.size, 0);
  });

  it('ignores unknown type names', () => {
    const decls = new Map<string, any>();
    const needed = new Set<string>();
    trackNeededSymbol(
      { type: 'TSTypeReference', typeName: { name: 'Unknown' } },
      decls,
      needed,
    );
    assert.equal(needed.size, 0);
  });
});

describe('serializeLiteralType', () => {
  it('returns source slice for TSLiteralType', () => {
    const source = 'type X = "hello"';
    const node = { type: 'TSLiteralType', start: 9, end: 16 };
    assert.equal(serializeLiteralType(node, source), '"hello"');
  });

  it('returns source slice for other node types', () => {
    const source = 'type X = number';
    const node = { type: 'TSNumberKeyword', start: 9, end: 15 };
    assert.equal(serializeLiteralType(node, source), 'number');
  });

  it('returns "undefined" for null node', () => {
    assert.equal(serializeLiteralType(null, ''), 'undefined');
  });
});

describe('buildAliasMetadata', () => {
  it('emits static metadata', () => {
    const result = buildAliasMetadata(
      { staticMetadata: { multi: true } },
      [],
      '',
    );
    assert.equal(result, '{ multi: true }');
  });

  it('emits multiple static metadata keys', () => {
    const result = buildAliasMetadata(
      { staticMetadata: { multi: true, scope: 'singleton' } },
      [],
      '',
    );
    assert.equal(result, '{ multi: true, scope: "singleton" }');
  });

  it('emits typeParamToMeta from type params', () => {
    // typeParams[0] is the main type, typeParams[1] is the first extra param
    const source = 'type X = Inject<Foo, "myName">';
    const typeParams = [
      { type: 'TSTypeReference', start: 16, end: 19 }, // Foo
      { type: 'TSLiteralType', start: 21, end: 29 },   // "myName"
    ];
    const result = buildAliasMetadata(
      { typeParamToMeta: { name: 0 } },
      typeParams,
      source,
    );
    assert.equal(result, '{ name: "myName" }');
  });

  it('emits tagsFromParams', () => {
    const source = 'type X = Tagged<Foo, "key", "val">';
    const typeParams = [
      { type: 'TSTypeReference', start: 16, end: 19 }, // Foo
      { type: 'TSLiteralType', start: 21, end: 26 },   // "key"
      { type: 'TSLiteralType', start: 28, end: 33 },   // "val"
    ];
    const result = buildAliasMetadata(
      { tagsFromParams: { keyParam: 0, valueParam: 1 } },
      typeParams,
      source,
    );
    assert.equal(result, '{ tags: { ["key"]: "val" } }');
  });

  it('returns empty braces when no config properties set', () => {
    const result = buildAliasMetadata({}, [], '');
    assert.equal(result, '{  }');
  });
});

describe('emitParamtypesEdits', () => {
  it('emits design:paramtypes for constructor reflection', () => {
    const reflections = [{
      className: 'Foo',
      methodName: null,
      params: [{ type: 'String', metadata: '{}' }],
      insertAfter: 100,
    }];
    const { edits, classPropertyNames } = emitParamtypesEdits(reflections);
    assert.equal(edits.length, 1);
    assert.ok(edits[0]!.replacement.includes('design:paramtypes'));
    assert.ok(edits[0]!.replacement.includes('Foo'));
    assert.ok(edits[0]!.replacement.includes('undefined')); // constructor key
    assert.equal(classPropertyNames.size, 0);
  });

  it('emits design:paramtypes for method reflection', () => {
    const reflections = [{
      className: 'Foo',
      methodName: 'doStuff',
      params: [{ type: 'Number', metadata: '{}' }],
      insertAfter: 100,
    }];
    const { edits } = emitParamtypesEdits(reflections);
    assert.equal(edits.length, 1);
    assert.ok(edits[0]!.replacement.includes('Foo.prototype'));
    assert.ok(edits[0]!.replacement.includes('"doStuff"'));
  });

  it('emits design:propertytype for property reflection', () => {
    const reflections = [{
      className: 'Foo',
      methodName: 'myProp',
      params: [{ type: 'String', metadata: '{}' }],
      insertAfter: 100,
      isProperty: true,
      fromPropertyDefinition: true,
    }];
    const { edits, classPropertyNames } = emitParamtypesEdits(reflections);
    assert.equal(edits.length, 1);
    assert.ok(edits[0]!.replacement.includes('design:propertytype'));
    assert.equal(classPropertyNames.size, 1);
  });

  it('includes elementType when present', () => {
    const reflections = [{
      className: 'Foo',
      methodName: null,
      params: [{ type: 'Array', metadata: '{}', elementType: 'String' }],
      insertAfter: 100,
    }];
    const { edits } = emitParamtypesEdits(reflections);
    assert.ok(edits[0]!.replacement.includes('elementType: String'));
  });

  it('uses computedKey for computed properties', () => {
    const reflections = [{
      className: 'Foo',
      methodName: 'sym',
      computedKey: 'sym',
      params: [{ type: 'String', metadata: '{}' }],
      insertAfter: 100,
    }];
    const { edits } = emitParamtypesEdits(reflections);
    assert.ok(edits[0]!.replacement.includes(', sym)'));
  });
});

describe('emitPropertiesEdits', () => {
  it('emits design:properties for tracked classes', () => {
    const map = new Map([
      ['Foo@100', { className: 'Foo', insertAfter: 100, props: ['"a"', '"b"'] }],
    ]);
    const edits = emitPropertiesEdits(map);
    assert.equal(edits.length, 1);
    assert.ok(edits[0]!.replacement.includes('design:properties'));
    assert.ok(edits[0]!.replacement.includes('["a", "b"]'));
    assert.ok(edits[0]!.replacement.includes('Foo'));
  });

  it('returns empty for empty map', () => {
    const edits = emitPropertiesEdits(new Map());
    assert.equal(edits.length, 0);
  });
});

describe('collectClassReflections', () => {
  function parseClass(code: string) {
    const result = parseSync('test.ts', code);
    const classNode = result.program.body.find(
      (n: any) => n.type === 'ClassDeclaration',
    );
    return classNode;
  }

  it('collects constructor parameters with Reflect marker', () => {
    const code = `import { Reflect } from 'rflct';\nclass Foo { constructor(x: Reflect<string>) {} }`;
    const classNode = parseClass(code);
    const decls = new Map<string, any>();
    const reflections: any[] = [];
    const needed = new Set<string>();
    collectClassReflections(classNode, code, decls, reflections, needed);
    assert.equal(reflections.length, 1);
    assert.equal(reflections[0].className, 'Foo');
    assert.equal(reflections[0].methodName, null);
    assert.equal(reflections[0].params.length, 1);
    assert.equal(reflections[0].params[0].type, 'String');
  });

  it('skips class without id', () => {
    const classNode = { id: null, body: { body: [] }, end: 10 };
    const reflections: any[] = [];
    collectClassReflections(classNode, '', new Map(), reflections, new Set());
    assert.equal(reflections.length, 0);
  });

  it('skips members without Reflect markers', () => {
    const code = `class Foo { constructor(x: string) {} }`;
    const classNode = parseClass(code);
    const reflections: any[] = [];
    collectClassReflections(classNode, code, new Map(), reflections, new Set());
    assert.equal(reflections.length, 0);
  });

  it('collects method parameters with Reflect marker', () => {
    const code = `import { Reflect } from 'rflct';\nclass Foo { doStuff(x: Reflect<number>) {} }`;
    const classNode = parseClass(code);
    const reflections: any[] = [];
    collectClassReflections(classNode, code, new Map(), reflections, new Set());
    assert.equal(reflections.length, 1);
    assert.equal(reflections[0].methodName, 'doStuff');
    assert.equal(reflections[0].params[0].type, 'Number');
  });

  it('collects property definitions with Reflect marker', () => {
    const code = `import { Reflect } from 'rflct';\nclass Foo { myProp!: Reflect<string>; }`;
    const classNode = parseClass(code);
    const reflections: any[] = [];
    collectClassReflections(classNode, code, new Map(), reflections, new Set());
    assert.equal(reflections.length, 1);
    assert.equal(reflections[0].methodName, 'myProp');
    assert.equal(reflections[0].isProperty, true);
    assert.equal(reflections[0].fromPropertyDefinition, true);
  });

  it('marks setter as isProperty', () => {
    const code = `import { Reflect } from 'rflct';\nclass Foo { set value(x: Reflect<number>) {} }`;
    const classNode = parseClass(code);
    const reflections: any[] = [];
    collectClassReflections(classNode, code, new Map(), reflections, new Set());
    assert.equal(reflections.length, 1);
    assert.equal(reflections[0].isProperty, true);
  });
});
