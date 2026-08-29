// Verifies that serializeTypeNode produces the same runtime type as
// TypeScript's emitDecoratorMetadata for various type annotations.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSync } from 'oxc-parser';

import { serializeTypeNode } from '../dist/core/serialize.js';

/**
 * Parse `class C { constructor(x: <typeAnnotation>) {} }` and return the
 * AST node for the first constructor parameter's type annotation.
 */
function parseTypeNode(typeAnnotation: string) {
  const code = `class C { constructor(x: ${typeAnnotation}) {} }`;
  const result = parseSync('test.ts', code);
  const classNode: any = result.program.body[0];
  const ctor: any = classNode.body.body[0];
  const param: any = ctor.value.params[0];
  return param.typeAnnotation?.typeAnnotation;
}

function serialize(typeAnnotation: string, declarations?: Map<string, any>) {
  const node = parseTypeNode(typeAnnotation);
  return serializeTypeNode(node, declarations ?? new Map());
}

// TypeScript's emitDecoratorMetadata rules:
// https://www.typescriptlang.org/docs/handbook/decorators.html#metadata

describe('serializeTypeNode – emitDecoratorMetadata parity', () => {
  describe('array types', () => {
    it('serializes string[] to Array', () => {
      assert.equal(serialize('string[]'), 'Array');
    });

    it('serializes number[] to Array', () => {
      assert.equal(serialize('number[]'), 'Array');
    });

    it('serializes nested arrays (string[][]) to Array', () => {
      assert.equal(serialize('string[][]'), 'Array');
    });

    it('serializes Array<string> (generic form) to Array', () => {
      // Array<T> is a TSTypeReference to "Array"
      assert.equal(serialize('Array<string>'), 'Array');
    });

    it('serializes ReadonlyArray<number> to ReadonlyArray', () => {
      // ReadonlyArray is a reference type — emitDecoratorMetadata emits it as-is
      assert.equal(serialize('ReadonlyArray<number>'), 'ReadonlyArray');
    });
  });

  describe('tuple types', () => {
    it('serializes [string, number] to Array', () => {
      assert.equal(serialize('[string, number]'), 'Array');
    });

    it('serializes empty tuple [] to Array', () => {
      assert.equal(serialize('[]'), 'Array');
    });

    it('serializes readonly tuple to Array', () => {
      assert.equal(serialize('readonly [string]'), 'Array');
    });

    it('serializes readonly array to Array', () => {
      assert.equal(serialize('readonly string[]'), 'Array');
    });
  });

  describe('union types', () => {
    it('serializes string | number to Object', () => {
      assert.equal(serialize('string | number'), 'Object');
    });

    it('serializes string | null to Object', () => {
      assert.equal(serialize('string | null'), 'Object');
    });

    it('serializes string | undefined to Object', () => {
      assert.equal(serialize('string | undefined'), 'Object');
    });

    it('serializes nullable union (Foo | null) to Object', () => {
      const decls = new Map([['Foo', { kind: 'class', name: 'Foo', exported: false, end: 10 }]]);
      assert.equal(serialize('Foo | null', decls), 'Object');
    });

    it('serializes boolean literal union (true | false) to Object', () => {
      assert.equal(serialize('true | false'), 'Object');
    });
  });

  describe('intersection types', () => {
    it('serializes A & B to Object', () => {
      const decls = new Map([
        ['A', { kind: 'class', name: 'A', exported: false, end: 10 }],
        ['B', { kind: 'class', name: 'B', exported: false, end: 20 }],
      ]);
      assert.equal(serialize('A & B', decls), 'Object');
    });

    it('serializes string & { length: number } to Object', () => {
      assert.equal(serialize('string & { length: number }'), 'Object');
    });
  });

  describe('generic / reference types', () => {
    it('serializes Promise<string> to Promise', () => {
      assert.equal(serialize('Promise<string>'), 'Promise');
    });

    it('serializes Map<string, number> to Map', () => {
      assert.equal(serialize('Map<string, number>'), 'Map');
    });

    it('serializes Set<number> to Set', () => {
      assert.equal(serialize('Set<number>'), 'Set');
    });

    it('serializes WeakMap<object, string> to WeakMap', () => {
      assert.equal(serialize('WeakMap<object, string>'), 'WeakMap');
    });

    it('serializes class reference to class name', () => {
      const decls = new Map([['MyService', { kind: 'class', name: 'MyService', exported: false, end: 10 }]]);
      assert.equal(serialize('MyService', decls), 'MyService');
    });

    it('serializes interface reference to __RFLCT_ prefixed symbol', () => {
      const decls = new Map([['ILogger', { kind: 'interface', name: 'ILogger', exported: false, end: 10 }]]);
      assert.equal(serialize('ILogger', decls), '__RFLCT_ILogger');
    });

    it('serializes type alias reference to __RFLCT_ prefixed symbol', () => {
      const decls = new Map([['Config', { kind: 'type', name: 'Config', exported: false, end: 10 }]]);
      assert.equal(serialize('Config', decls), '__RFLCT_Config');
    });

    it('serializes unknown reference (no declaration) to its name', () => {
      assert.equal(serialize('SomeExternalClass'), 'SomeExternalClass');
    });
  });

  describe('function types', () => {
    it('serializes () => void to Function', () => {
      assert.equal(serialize('() => void'), 'Function');
    });

    it('serializes (a: string) => number to Function', () => {
      assert.equal(serialize('(a: string) => number'), 'Function');
    });

    it('serializes constructor type (new () => Foo) to Function', () => {
      assert.equal(serialize('new () => Foo'), 'Function');
    });
  });

  describe('special types (any, unknown, never, object)', () => {
    it('serializes any to Object', () => {
      assert.equal(serialize('any'), 'Object');
    });

    it('serializes unknown to Object', () => {
      assert.equal(serialize('unknown'), 'Object');
    });

    it('serializes never to Object', () => {
      assert.equal(serialize('never'), 'Object');
    });

    it('serializes object to Object', () => {
      assert.equal(serialize('object'), 'Object');
    });
  });

  describe('void / null / undefined', () => {
    it('serializes void to void 0', () => {
      assert.equal(serialize('void'), 'void 0');
    });

    it('serializes null to void 0', () => {
      assert.equal(serialize('null'), 'void 0');
    });

    it('serializes undefined to void 0', () => {
      assert.equal(serialize('undefined'), 'void 0');
    });
  });

  describe('literal types', () => {
    it('serializes string literal "hello" to "hello"', () => {
      assert.equal(serialize('"hello"'), '"hello"');
    });

    it('serializes numeric literal 42 to 42', () => {
      assert.equal(serialize('42'), '42');
    });

    it('serializes true to true', () => {
      assert.equal(serialize('true'), 'true');
    });

    it('serializes template literal type to Object', () => {
      assert.equal(serialize('`hello${string}`'), 'Object');
    });
  });

  describe('parenthesized types', () => {
    it('serializes (string) to String (unwraps parens)', () => {
      assert.equal(serialize('(string)'), 'String');
    });

    it('serializes (number[]) to Array (unwraps parens)', () => {
      assert.equal(serialize('(number[])'), 'Array');
    });
  });

  describe('conditional types', () => {
    it('serializes conditional type to Object', () => {
      assert.equal(serialize('string extends number ? true : false'), 'Object');
    });
  });

  describe('mapped / indexed / infer types', () => {
    it('serializes indexed access type (Foo["bar"]) to Object', () => {
      assert.equal(serialize('Foo["bar"]'), 'Object');
    });

    it('serializes keyof to Object', () => {
      assert.equal(serialize('keyof Foo'), 'Object');
    });

    it('serializes typeof to Object', () => {
      assert.equal(serialize('typeof Foo'), 'Object');
    });
  });

  describe('type-level keywords used as annotations', () => {
    it('serializes bigint to BigInt', () => {
      assert.equal(serialize('bigint'), 'BigInt');
    });

    it('serializes symbol to Symbol', () => {
      assert.equal(serialize('symbol'), 'Symbol');
    });
  });

  describe('missing type annotation', () => {
    it('returns Object for undefined node', () => {
      assert.equal(serializeTypeNode(undefined, new Map()), 'Object');
    });

    it('returns Object for null node', () => {
      assert.equal(serializeTypeNode(null, new Map()), 'Object');
    });
  });
});
