import { describe, it, expect } from 'vitest';
import { fromRaw, buildFormData, depthPromptRoleToStr } from './characterApi';
import type { Character } from '../types';

/* ---------- fixture ---------- */

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    avatar: 'a.png',
    name: 'Hero',
    description: '',
    otherPrompts: {
      scenario: '',
      mesExample: '',
      personality: '',
      systemPrompt: '',
      postHistoryInstructions: '',
      depthPrompt: { prompt: '', depth: 4, role: 'system' },
    },
    greetings: ['hi'],
    creatorMeta: {
      creator: '',
      creatorNotes: '',
      version: '',
      tags: [],
    },
    talkativeness: 0.5,
    fav: false,
    worldbook: null,
    regexs: [],
    scripts: [],
    ...overrides,
  };
}

describe('characterApi - depthPromptRoleToStr', () => {
  it('字符串原样返回', () => {
    expect(depthPromptRoleToStr('system')).toBe('system');
    expect(depthPromptRoleToStr('user')).toBe('user');
    expect(depthPromptRoleToStr('assistant')).toBe('assistant');
  });

  it('兼容历史数字值', () => {
    expect(depthPromptRoleToStr(0)).toBe('system');
    expect(depthPromptRoleToStr(1)).toBe('user');
    expect(depthPromptRoleToStr(2)).toBe('assistant');
  });

  it('未知值默认 system', () => {
    expect(depthPromptRoleToStr('unknown')).toBe('system');
    expect(depthPromptRoleToStr(null)).toBe('system');
    expect(depthPromptRoleToStr(undefined)).toBe('system');
    expect(depthPromptRoleToStr(99)).toBe('system');
  });
});

describe('characterApi - fromRaw', () => {
  it('v2 优先 v1 兜底：name/description/scenario/mes_example/personality', () => {
    const c = fromRaw({
      avatar: 'a.png',
      name: 'v1Name',
      description: 'v1Desc',
      data: { name: 'v2Name', description: 'v2Desc' },
    });
    expect(c.name).toBe('v2Name');
    expect(c.description).toBe('v2Desc');
  });

  it('v2 为空时用 v1 兜底', () => {
    const c = fromRaw({
      avatar: 'a.png',
      name: 'v1Name',
      data: {},
    });
    expect(c.name).toBe('v1Name');
  });

  it('avatar 缺失 → ""', () => {
    const c = fromRaw({});
    expect(c.avatar).toBe('');
  });

  it('systemPrompt 只有 v2，无 v1 兜底', () => {
    const c = fromRaw({ system_prompt: 'v1sp', data: { system_prompt: 'v2sp' } });
    expect(c.otherPrompts.systemPrompt).toBe('v2sp');
    const c2 = fromRaw({ system_prompt: 'v1sp', data: {} });
    expect(c2.otherPrompts.systemPrompt).toBe('');
  });

  it('creatorNotes ← v2.creator_notes ?? v1.creatorcomment', () => {
    const c = fromRaw({ creatorcomment: 'v1cn', data: {} });
    expect(c.creatorMeta.creatorNotes).toBe('v1cn');
    const c2 = fromRaw({ creatorcomment: 'v1cn', data: { creator_notes: 'v2cn' } });
    expect(c2.creatorMeta.creatorNotes).toBe('v2cn');
  });

  it('greetings = [first_mes, ...alternate_greetings]', () => {
    const c = fromRaw({ first_mes: 'f', data: { alternate_greetings: ['g1', 'g2'] } });
    expect(c.greetings).toEqual(['f', 'g1', 'g2']);
    const c2 = fromRaw({ first_mes: 'f1', data: {} });
    expect(c2.greetings).toEqual(['f1']);
  });

  it('depthPrompt：prompt/depth/role 映射，depth 非数 → 4', () => {
    const c = fromRaw({
      data: { extensions: { depth_prompt: { prompt: 'p', depth: 7, role: 'assistant' } } },
    });
    expect(c.otherPrompts.depthPrompt.prompt).toBe('p');
    expect(c.otherPrompts.depthPrompt.depth).toBe(7);
    expect(c.otherPrompts.depthPrompt.role).toBe('assistant');
    const c2 = fromRaw({ data: { extensions: { depth_prompt: { prompt: 'p' } } } });
    expect(c2.otherPrompts.depthPrompt.depth).toBe(4);
    expect(c2.otherPrompts.depthPrompt.role).toBe('system');
  });

  it('talkativeness：v2 extensions 优先，v1 兜底，可能是字符串用 Number(...)||0.5', () => {
    const c = fromRaw({ talkativeness: '0.8', data: {} });
    expect(c.talkativeness).toBe(0.8);
    const c2 = fromRaw({ talkativeness: 'abc', data: {} });
    expect(c2.talkativeness).toBe(0.5);
    const c3 = fromRaw({ data: { extensions: { talkativeness: 0.3 } } });
    expect(c3.talkativeness).toBe(0.3);
  });

  it('tags：v2.tags 优先，否则 v1.tags，否则 []', () => {
    expect(fromRaw({ tags: ['v1'], data: {} }).creatorMeta.tags).toEqual(['v1']);
    expect(fromRaw({ tags: ['v1'], data: { tags: ['v2'] } }).creatorMeta.tags).toEqual(['v2']);
    expect(fromRaw({}).creatorMeta.tags).toEqual([]);
  });

  it('worldbook ← extensions.world 字符串，无则 null', () => {
    expect(fromRaw({ data: { extensions: { world: 'MyWB' } } }).worldbook).toBe('MyWB');
    expect(fromRaw({ data: { extensions: { world: '' } } }).worldbook).toBeNull();
    expect(fromRaw({}).worldbook).toBeNull();
  });

  it('fav ← extensions.fav ?? raw.fav', () => {
    expect(fromRaw({ fav: true, data: {} }).fav).toBe(true);
    expect(fromRaw({ data: { extensions: { fav: true } } }).fav).toBe(true);
    expect(fromRaw({}).fav).toBe(false);
  });

  it('regex_scripts → regexs（disabled 取反为 enabled）', () => {
    const c = fromRaw({
      data: { extensions: { regex_scripts: [{ id: 'r', scriptName: 'R', disabled: true }] } },
    });
    expect(c.regexs).toHaveLength(1);
    expect(c.regexs[0].id).toBe('r');
    expect(c.regexs[0].enabled).toBe(false);
  });

  it('regex_scripts 非数组时 regexs=[]', () => {
    const c = fromRaw({ data: { extensions: { regex_scripts: 'no' } } });
    expect(c.regexs).toEqual([]);
  });
});

describe('characterApi - buildFormData', () => {
  it('基本字段写入 FormData', () => {
    const data = makeCharacter({ name: 'Bob', description: 'desc' });
    const fd = buildFormData(data, null);
    expect(fd.get('ch_name')).toBe('Bob');
    expect(fd.get('description')).toBe('desc');
    expect(fd.get('first_mes')).toBe('hi');
    expect(fd.get('creator')).toBe('');
    expect(fd.get('talkativeness')).toBe('0.5');
    expect(fd.get('fav')).toBe('false');
  });

  it('新建路径（oldRaw=null）不写 avatar_url/chat/create_date', () => {
    const fd = buildFormData(makeCharacter(), null);
    expect(fd.get('avatar_url')).toBeNull();
    expect(fd.get('chat')).toBeNull();
    expect(fd.get('create_date')).toBeNull();
  });

  it('编辑路径（有 oldRaw）写 avatar_url/chat/create_date', () => {
    const oldRaw = { avatar: 'old.png', chat: 'c1', create_date: 'd1', data: {} };
    const data = makeCharacter({ avatar: 'new.png' });
    const fd = buildFormData(data, oldRaw as Record<string, unknown>);
    expect(fd.get('avatar_url')).toBe('new.png');
    expect(fd.get('chat')).toBe('c1');
    expect(fd.get('create_date')).toBe('d1');
  });

  it('ch_name 三级回退：data.name → oldData.name → oldRaw.name → ""', () => {
    expect(buildFormData(makeCharacter({ name: '' }), null).get('ch_name')).toBe('');
    expect(
      buildFormData(makeCharacter({ name: '' }), { data: { name: 'old2' } }).get('ch_name')
    ).toBe('old2');
    expect(
      buildFormData(makeCharacter({ name: '' }), { name: 'old1', data: {} }).get('ch_name')
    ).toBe('old1');
  });

  it('alternate_greetings 从 greetings[1] 开始逐个 append', () => {
    const data = makeCharacter({ greetings: ['g0', 'g1', 'g2'] });
    const fd = buildFormData(data, null);
    expect(fd.get('first_mes')).toBe('g0');
    expect(fd.getAll('alternate_greetings')).toEqual(['g1', 'g2']);
  });

  it('tags 逐个 append', () => {
    const data = makeCharacter({
      creatorMeta: { creator: '', creatorNotes: '', version: '', tags: ['t1', 't2'] },
    });
    const fd = buildFormData(data, null);
    expect(fd.getAll('tags')).toEqual(['t1', 't2']);
  });

  it('worldbook 为真时 append world', () => {
    const data = makeCharacter({ worldbook: 'MyWB' });
    expect(buildFormData(data, null).get('world')).toBe('MyWB');
    expect(buildFormData(makeCharacter(), null).get('world')).toBeNull();
  });

  it('extensions 打包：oldExt 打底 → data.extensions 覆盖 → 已知字段强制重写', () => {
    const data = makeCharacter({ talkativeness: 0.9, fav: true });
    const oldRaw = { data: { extensions: { customField: 'x', talkativeness: 0.1 } } };
    const fd = buildFormData(data, oldRaw as Record<string, unknown>);
    const ext = JSON.parse(fd.get('extensions') as string) as Record<string, unknown>;
    expect(ext.customField).toBe('x'); // oldExt 打底
    expect(ext.talkativeness).toBe(0.9); // data 覆盖
    expect(ext.fav).toBe(true);
    expect(ext.world).toBeUndefined(); // worldbook null → undefined
    expect(ext.depth_prompt).toEqual({ prompt: '', depth: 4, role: 'system' });
    expect(ext.regex_scripts).toEqual([]);
  });

  it('depth_prompt.role 字符串原样透传', () => {
    const data = makeCharacter({
      otherPrompts: {
        scenario: '',
        mesExample: '',
        personality: '',
        systemPrompt: '',
        postHistoryInstructions: '',
        depthPrompt: { prompt: 'p', depth: 6, role: 'assistant' },
      },
    });
    const fd = buildFormData(data, null);
    const ext = JSON.parse(fd.get('extensions') as string) as Record<string, unknown>;
    expect((ext.depth_prompt as Record<string, unknown>).role).toBe('assistant');
  });

  it('avatar 文件：传 File 时直接 append', () => {
    const file = new File(['data'], 'avatar.png', { type: 'image/png' });
    const fd = buildFormData(makeCharacter(), null, file);
    expect(fd.get('avatar')).toBe(file);
  });

  it('avatar Blob 包装成带文件名 .png 的 File', () => {
    const blob = new Blob(['data'], { type: 'image/jpeg' });
    const fd = buildFormData(makeCharacter({ name: 'N' }), null, blob);
    const avatar = fd.get('avatar') as File;
    expect(avatar).toBeTruthy();
    expect(avatar.name).toBe('N.png');
    expect(avatar.type).toBe('image/jpeg');
  });

  it('无 avatarFile 时完全不传 avatar 字段', () => {
    expect(buildFormData(makeCharacter(), null).get('avatar')).toBeNull();
  });
});
