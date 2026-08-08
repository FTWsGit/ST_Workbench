import { describe, it, expect } from 'vitest';
import zhCN from './locales/zh-CN';
import en from './locales/en';

/**
 * 运行期断言两张 locale 表的 key 全集一致，防漏翻译。
 * 编译期已有约束（en.ts 用 `satisfies Record<keyof typeof zhCN, string>`），
 * 这里再补运行期断言作为双保险——编译期约束只在类型系统里生效，runtime 不查。
 */
describe('i18n locale key parity', () => {
  it('zh-CN 与 en 的 key 全集一致（顺序、数量、内容）', () => {
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(zhKeys);
    expect(enKeys.length).toBe(zhKeys.length);
  });

  it('zh-CN 与 en 的 key 集（Set）相等（无顺序敏感）', () => {
    const zhSet = new Set(Object.keys(zhCN));
    const enSet = new Set(Object.keys(en));
    expect(enSet.size).toBe(zhSet.size);
    for (const k of zhSet) {
      expect(enSet.has(k)).toBe(true);
    }
    for (const k of enSet) {
      expect(zhSet.has(k)).toBe(true);
    }
  });

  it('每个 key 在两个 locale 里都有非空 string 值', () => {
    const zhKeys = Object.keys(zhCN);
    for (const k of zhKeys) {
      const v = zhCN[k as keyof typeof zhCN];
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
    const enKeys = Object.keys(en);
    for (const k of enKeys) {
      const v = en[k as keyof typeof en];
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('两张表导出的都是对象（LocaleTable 形状）', () => {
    expect(typeof zhCN).toBe('object');
    expect(typeof en).toBe('object');
    expect(zhCN).not.toBeNull();
    expect(en).not.toBeNull();
    expect(Object.keys(zhCN).length).toBeGreaterThan(0);
    expect(Object.keys(en).length).toBeGreaterThan(0);
  });
});
