import { describe, it, expect } from 'vitest';
import { parseVfsPath, formatVfsPath } from './path';

describe('parseVfsPath', () => {
  it('parses a workspace root', () => {
    expect(parseVfsPath('/preset')).toEqual({
      ok: true,
      path: { workspace: 'preset', segments: [] },
    });
  });

  it('parses collection/item/field segments', () => {
    expect(parseVfsPath('/preset/prompts/1/content')).toEqual({
      ok: true,
      path: { workspace: 'preset', segments: ['prompts', '1', 'content'] },
    });
  });

  it('tolerates missing/trailing slashes', () => {
    expect(parseVfsPath('preset/prompts')).toEqual({
      ok: true,
      path: { workspace: 'preset', segments: ['prompts'] },
    });
    expect(parseVfsPath('/preset/prompts/')).toEqual({
      ok: true,
      path: { workspace: 'preset', segments: ['prompts'] },
    });
  });

  it('rejects empty path', () => {
    expect(parseVfsPath('')).toEqual({ ok: false, error: 'empty path' });
    expect(parseVfsPath('   ')).toEqual({ ok: false, error: 'empty path' });
    const r = parseVfsPath('/');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('no workspace');
  });

  it('rejects repeated slash (empty segment)', () => {
    expect(parseVfsPath('/preset//prompts').ok).toBe(false);
  });

  it('rejects unknown workspace', () => {
    const r = parseVfsPath('/foo/prompts');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('unknown workspace');
  });

  it('rejects paths deeper than MAX_PATH_SEGMENTS', () => {
    const r = parseVfsPath('/preset/prompts/1/content/foo');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('too deep');
  });

  it('rejects . and .. segments', () => {
    expect(parseVfsPath('/preset/../prompts').ok).toBe(false);
    expect(parseVfsPath('/preset/./prompts').ok).toBe(false);
  });
});

describe('formatVfsPath', () => {
  it('round-trips canonical paths', () => {
    const path = { workspace: 'preset' as const, segments: ['prompts', '1', 'content'] };
    expect(formatVfsPath(path)).toBe('/preset/prompts/1/content');
    expect(parseVfsPath(formatVfsPath(path))).toEqual({ ok: true, path });
  });

  it('formats a workspace root', () => {
    expect(formatVfsPath({ workspace: 'worldbook', segments: [] })).toBe('/worldbook');
  });
});
