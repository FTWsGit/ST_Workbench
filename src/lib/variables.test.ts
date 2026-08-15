import { describe, it, expect } from 'vitest';
import { scanVariableMacros } from './variables';

// ===== scanVariableMacros =====

describe('scanVariableMacros', () => {
  it('setvar::name::value → set/local + varName + varValue', () => {
    const out = scanVariableMacros('{{setvar::hp::10}}');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'set',
      scope: 'local',
      varName: 'hp',
      varValue: '10',
    });
    expect(out[0].pos).toBe(0);
    expect(out[0].end).toBe('{{setvar::hp::10}}'.length);
  });

  it('getvar::name → get/local，varValue 恒空', () => {
    const out = scanVariableMacros('{{getvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'get', scope: 'local', varName: 'hp', varValue: '' });
  });

  it('addvar::name::value → add/local + hasValue', () => {
    const out = scanVariableMacros('{{addvar::hp::5}}');
    expect(out[0]).toMatchObject({ kind: 'add', scope: 'local', varName: 'hp', varValue: '5' });
  });

  it('incvar::name → inc/local，无值', () => {
    const out = scanVariableMacros('{{incvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'inc', scope: 'local', varName: 'hp', varValue: '' });
  });

  it('decvar::name → dec/local', () => {
    const out = scanVariableMacros('{{decvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'dec', scope: 'local', varName: 'hp', varValue: '' });
  });

  it('setglobalvar::name::value → set/global', () => {
    const out = scanVariableMacros('{{setglobalvar::hp::10}}');
    expect(out[0]).toMatchObject({ kind: 'set', scope: 'global', varName: 'hp', varValue: '10' });
  });

  it('getglobalvar::name → get/global', () => {
    const out = scanVariableMacros('{{getglobalvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'get', scope: 'global', varName: 'hp', varValue: '' });
  });

  it('addglobalvar::name::value → add/global', () => {
    const out = scanVariableMacros('{{addglobalvar::hp::5}}');
    expect(out[0]).toMatchObject({ kind: 'add', scope: 'global', varName: 'hp', varValue: '5' });
  });

  it('incglobalvar::name → inc/global', () => {
    const out = scanVariableMacros('{{incglobalvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'inc', scope: 'global', varName: 'hp', varValue: '' });
  });

  it('decglobalvar::name → dec/global', () => {
    const out = scanVariableMacros('{{decglobalvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'dec', scope: 'global', varName: 'hp', varValue: '' });
  });

  it('hasvar::name → has/local', () => {
    const out = scanVariableMacros('{{hasvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'has', scope: 'local', varName: 'hp', varValue: '' });
  });

  it('hasglobalvar::name → has/global', () => {
    const out = scanVariableMacros('{{hasglobalvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'has', scope: 'global', varName: 'hp', varValue: '' });
  });

  it('deletevar::name → delete/local', () => {
    const out = scanVariableMacros('{{deletevar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'delete', scope: 'local', varName: 'hp', varValue: '' });
  });

  it('varName 被 trim', () => {
    const out = scanVariableMacros('{{setvar:: hp ::10}}');
    expect(out[0].varName).toBe('hp');
  });

  it('跨行定位 line/col（line=换行数 0-based，col=名字列 0-based）', () => {
    const text = '\n\n{{getvar::hp}}';
    const out = scanVariableMacros(text);
    expect(out[0].line).toBe(2);
    // {{ 在 index 2，名字 hp 在 index 2+2+8('getvar::')=12，lastNl=1，col=12-1-1=10
    expect(out[0].col).toBe(10);
  });

  it('第一行无换行时 col 正确', () => {
    const text = '{{setvar::hp::10}}';
    const out = scanVariableMacros(text);
    // lastNl=-1，after=2+8=10，col=10-(-1)-1=10
    expect(out[0].col).toBe(10);
    expect(out[0].line).toBe(0);
  });

  it('未闭合 macro 不报告', () => {
    expect(scanVariableMacros('{{setvar::hp::10')).toEqual([]);
  });

  it('非 13 种前缀的 macro 不报告，但递归进 args 继续找嵌套 var op', () => {
    const out = scanVariableMacros('{{trim::{{getvar::hp}}}}');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'get', scope: 'local', varName: 'hp' });
  });

  it('set/add 值内嵌套 var op 递归报告', () => {
    const out = scanVariableMacros('{{setvar::a::{{getvar::b}}}}');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: 'set', scope: 'local', varName: 'a' });
    expect(out[1]).toMatchObject({ kind: 'get', scope: 'local', varName: 'b' });
  });

  it('set/add 缺 :: 分隔符 → 不匹配该前缀，视为其他宏递归', () => {
    const out = scanVariableMacros('{{setvar::hp}}');
    // 没 :: 分隔 → break → matched=false → 递归进 inner 找嵌套（无）→ 空
    expect(out).toEqual([]);
  });

  it('普通文本中无 macro → 空', () => {
    expect(scanVariableMacros('hello world')).toEqual([]);
  });

  it('多 macro 各独立报告', () => {
    const out = scanVariableMacros('{{getvar::a}}{{getvar::b}}');
    expect(out).toHaveLength(2);
    expect(out[0].varName).toBe('a');
    expect(out[1].varName).toBe('b');
  });

  it('误报防护：越界 macro（end 超出当前递归范围）不报告', () => {
    // outer macro 未闭合但 inner 合法 —— outer end=-1 不报告，inner 也被跳过
    const out = scanVariableMacros('{{ {{getvar::a}} }}');
    // {{ 后空格，不是 {{ → 单 { 字符扫描，inner {{getvar::a}} 合法闭合会被找到
    expect(out).toHaveLength(1);
    expect(out[0].varName).toBe('a');
  });
});
