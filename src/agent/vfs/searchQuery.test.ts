import { describe, it, expect } from 'vitest';
import {
  parseSearchQuery,
  validateSearchQuery,
  searchItems,
  type SearchableField,
} from './searchQuery';

describe('parseSearchQuery', () => {
  it('parses plain text', () => {
    expect(parseSearchQuery('foo')).toEqual({ kind: 'text', value: 'foo' });
    expect(parseSearchQuery('  hello world  ')).toEqual({ kind: 'text', value: 'hello world' });
  });

  it('parses regex with flags', () => {
    expect(parseSearchQuery('/foo/gi')).toEqual({ kind: 'regex', source: 'foo', flags: 'gi' });
    expect(parseSearchQuery('/a.b/')).toEqual({ kind: 'regex', source: 'a.b', flags: '' });
  });

  it('parses field equality', () => {
    expect(parseSearchQuery('role=user')).toEqual({
      kind: 'field',
      field: 'role',
      op: '=',
      value: 'user',
    });
    expect(parseSearchQuery('enabled=false')).toEqual({
      kind: 'field',
      field: 'enabled',
      op: '=',
      value: false,
    });
    expect(parseSearchQuery('enabled=true')).toEqual({
      kind: 'field',
      field: 'enabled',
      op: '=',
      value: true,
    });
    expect(parseSearchQuery('depth=5')).toEqual({
      kind: 'field',
      field: 'depth',
      op: '=',
      value: 5,
    });
  });

  it('parses field inequality', () => {
    expect(parseSearchQuery('role!=user')).toEqual({
      kind: 'field',
      field: 'role',
      op: '!=',
      value: 'user',
    });
  });
});

describe('validateSearchQuery', () => {
  it('accepts text and field queries', () => {
    expect(validateSearchQuery({ kind: 'text', value: 'x' })).toBeNull();
    expect(validateSearchQuery({ kind: 'field', field: 'role', op: '=', value: 'u' })).toBeNull();
  });

  it('rejects illegal regex flags', () => {
    expect(validateSearchQuery({ kind: 'regex', source: 'a', flags: 'z' })).toContain(
      'invalid regex flags'
    );
  });

  it('rejects over-long regex source', () => {
    const source = 'a'.repeat(300);
    expect(validateSearchQuery({ kind: 'regex', source, flags: '' })).toContain('too long');
  });

  it('rejects invalid regex syntax', () => {
    expect(validateSearchQuery({ kind: 'regex', source: '(', flags: '' })).toContain(
      'invalid regex'
    );
  });

  it('accepts a valid regex', () => {
    expect(validateSearchQuery({ kind: 'regex', source: 'a+', flags: 'gi' })).toBeNull();
  });
});

const FIELDS: SearchableField[] = [
  { key: 'content', kind: 'text' },
  { key: 'role', kind: 'enum' },
  { key: 'enabled', kind: 'enum' },
  { key: 'keys', kind: 'list' },
];

const ITEMS = [
  {
    id: 'a',
    name: 'blockA',
    content: 'hello world\nsecond line with foo',
    role: 'system',
    enabled: true,
    keys: ['alpha', 'beta'],
  },
  { id: 'b', name: 'blockB', content: 'no match here', role: 'user', enabled: false, keys: [] },
];

describe('searchItems', () => {
  it('text search finds line/col', () => {
    const hits = searchItems(ITEMS, FIELDS, { kind: 'text', value: 'foo' }, (i) => ({
      id: String(i.id),
      name: String(i.name),
    }));
    expect(hits).toHaveLength(1);
    expect(hits[0].itemId).toBe('a');
    expect(hits[0].fieldKey).toBe('content');
    expect(hits[0].line).toBe(1);
    expect(hits[0].col).toBe(17);
  });

  it('regex search matches across fields', () => {
    const hits = searchItems(
      ITEMS,
      FIELDS,
      { kind: 'regex', source: 'hel+o', flags: 'i' },
      (i) => ({
        id: String(i.id),
        name: String(i.name),
      })
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].itemId).toBe('a');
  });

  it('list field search uses element index as line', () => {
    const hits = searchItems(ITEMS, FIELDS, { kind: 'text', value: 'beta' }, (i) => ({
      id: String(i.id),
      name: String(i.name),
    }));
    expect(hits).toHaveLength(1);
    expect(hits[0].fieldKey).toBe('keys');
    expect(hits[0].line).toBe(1);
  });

  it('field query does exact match', () => {
    const hits = searchItems(
      ITEMS,
      FIELDS,
      { kind: 'field', field: 'role', op: '=', value: 'user' },
      (i) => ({
        id: String(i.id),
        name: String(i.name),
      })
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].itemId).toBe('b');
    expect(hits[0].line).toBe(-1);
  });

  it('field query supports boolean coercion', () => {
    const hits = searchItems(
      ITEMS,
      FIELDS,
      { kind: 'field', field: 'enabled', op: '=', value: false },
      (i) => ({
        id: String(i.id),
        name: String(i.name),
      })
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].itemId).toBe('b');
  });

  it('field inequality matches the complement', () => {
    const hits = searchItems(
      ITEMS,
      FIELDS,
      { kind: 'field', field: 'role', op: '!=', value: 'system' },
      (i) => ({
        id: String(i.id),
        name: String(i.name),
      })
    );
    expect(hits.map((h) => h.itemId)).toEqual(['b']);
  });
});
