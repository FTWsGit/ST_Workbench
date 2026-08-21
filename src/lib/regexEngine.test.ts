import { describe, it, expect } from 'vitest';
import { parseFindRegex, applyRegexScript } from './regexEngine';
import type { RegexScript } from '../types';

function mk(findRegex: string, replaceString?: string, trimStrings?: string[]): RegexScript {
  return {
    id: 'test',
    name: 'test',
    findRegex: findRegex,
    replaceString: replaceString ?? '',
    trimStrings: trimStrings ?? [],
    placement: [],
    enabled: true,
    scope: ['displayOnly', 'promptOnly'],
    runOnEdit: false,
    substituteRegex: 'none',
    depth: { minDepth: null, maxDepth: null },
  };
}

describe('parseFindRegex', () => {
  describe('空输入短路', () => {
    it('空串返回 null', () => {
      expect(parseFindRegex('')).toBeNull();
    });
    it('运行时传 null 返回 null（类型声明为 string，但 !raw 容错）', () => {
      expect(parseFindRegex(null as unknown as string)).toBeNull();
    });
    it('运行时传 undefined 返回 null', () => {
      expect(parseFindRegex(undefined as unknown as string)).toBeNull();
    });
  });

  describe('定界符 /pattern/flags 解析', () => {
    it('标准 /abc/ → /abc/g（强制补 g）', () => {
      const re = parseFindRegex('/abc/')!;
      expect(re.source).toBe('abc');
      expect(re.flags).toBe('g');
    });
    it('/abc/i → 追加 g 到尾部 → /abc/gi', () => {
      const re = parseFindRegex('/abc/i')!;
      expect(re.source).toBe('abc');
      expect(re.flags).toBe('gi');
    });
    it('/abc/gi → 已有 g 原样保留', () => {
      const re = parseFindRegex('/abc/gi')!;
      expect(re.source).toBe('abc');
      expect(re.flags).toBe('gi');
    });
    it('/abc/g → 已有 g 原样', () => {
      const re = parseFindRegex('/abc/g')!;
      expect(re.source).toBe('abc');
      expect(re.flags).toBe('g');
    });
    it('贪婪取最后 / 作定界符结尾：/a/b/ → pattern=a/b', () => {
      const re = parseFindRegex('/a/b/')!;
      expect(re).toEqual(new RegExp('a/b', 'g'));
      expect(re.flags).toBe('g');
    });
    it('含换行的 pattern 有效（[\\s\\S] 跨行）', () => {
      const re = parseFindRegex('/a\nb/')!;
      expect(re).toEqual(new RegExp('a\\nb', 'g'));
    });
  });

  describe('无定界符容错', () => {
    it('裸 pattern abc → /abc/g', () => {
      const re = parseFindRegex('abc')!;
      expect(re.source).toBe('abc');
      expect(re.flags).toBe('g');
    });
    it('/abc（不以 / 结尾）→ 不匹配定界符正则 → 整体当裸 pattern，字面匹配 /abc', () => {
      const re = parseFindRegex('/abc')!;
      expect(re).toEqual(new RegExp('/abc', 'g'));
      expect(re.flags).toBe('g');
    });
    it('/abc/1（末尾非字母）→ 不匹配定界符 → 裸 pattern 字面匹配 /abc/1', () => {
      const re = parseFindRegex('/abc/1')!;
      expect(re).toEqual(new RegExp('/abc/1', 'g'));
      expect(re.flags).toBe('g');
    });
  });

  describe('非法正则返回 null', () => {
    it('/(/ → pattern=( 构造抛错 → null', () => {
      expect(parseFindRegex('/(/')).toBeNull();
    });
    it('/[/ → pattern=[ 构造抛错 → null', () => {
      expect(parseFindRegex('/[/')).toBeNull();
    });
    it('/abc/gg → 重复 flag g 抛错 → null', () => {
      expect(parseFindRegex('/abc/gg')).toBeNull();
    });
    it('/abc/ii → 重复 flag i 抛错 → null', () => {
      expect(parseFindRegex('/abc/ii')).toBeNull();
    });
  });
});

describe('applyRegexScript', () => {
  describe('非法正则短路', () => {
    it('findRegex 非法 → 原样返回 text', () => {
      const text = 'hello world';
      const script = mk('/(/', '{{match}}');
      expect(applyRegexScript(text, script)).toBe('hello world');
    });
    it('findRegex 空 → 原样返回 text', () => {
      const text = 'hello';
      const script = mk('', '{{match}}');
      expect(applyRegexScript(text, script)).toBe('hello');
    });
  });

  describe('空文本', () => {
    it('text 为空串 → 返回空串', () => {
      const script = mk('/a/', '{{match}}');
      expect(applyRegexScript('', script)).toBe('');
    });
  });

  describe('{{match}} 替换', () => {
    it('无捕获组，单匹配 {{match}} 替换为整段匹配', () => {
      const script = mk('/abc/', 'X{{match}}Y');
      expect(applyRegexScript('xyzabcxyz', script)).toBe('xyzXabcYxyz');
    });
    it('强制 g，多匹配各自替换', () => {
      const script = mk('a', '[{{match}}]');
      expect(applyRegexScript('banana', script)).toBe('b[a]n[a]n[a]');
    });
    it('{{match}} 多次出现全部替换', () => {
      const script = mk('/a/', '{{match}}-{{match}}');
      // 强制 g 会把所有 'a' 都替换；每段 match 是单字符 'a'
      expect(applyRegexScript('a', script)).toBe('a-a');
    });
  });

  describe('$n 替换', () => {
    it('有捕获组 $1/$2 对应修剪后的组', () => {
      const script = mk('/(a)(b)/', '$1-$2');
      expect(applyRegexScript('ab', script)).toBe('a-b');
    });
    it('组未参与匹配（交替 (a)|(b) 只匹配 b）→ $1 回退空串', () => {
      const script = mk('/(a)|(b)/', '$1-$2');
      expect(applyRegexScript('b', script)).toBe('-b');
    });
    it('$0 → 越界索引 trimmedGroups[-1] → 回退空串', () => {
      const script = mk('/(a)/', '$0');
      expect(applyRegexScript('a', script)).toBe('');
    });
    it('$9 超出组数 → 回退空串', () => {
      const script = mk('/(a)(b)/', '$9');
      expect(applyRegexScript('ab', script)).toBe('');
    });
    it('$n 与 {{match}} 混合', () => {
      const script = mk('/(a)(b)/', '{{match}}=$1+$2');
      expect(applyRegexScript('ab', script)).toBe('ab=a+b');
    });
    it('无捕获组时 $1 → 回退空串', () => {
      const script = mk('/abc/', '$1');
      expect(applyRegexScript('abc', script)).toBe('');
    });
  });

  describe('trimStrings 修剪', () => {
    it('trimStrings 命中 → 从 match 中删除所有出现', () => {
      const script = mk('/abc/', '{{match}}', ['b']);
      expect(applyRegexScript('abc', script)).toBe('ac');
    });
    it('trimStrings 多项依次修剪', () => {
      const script = mk('/abc/', '{{match}}', ['a', 'c']);
      expect(applyRegexScript('abc', script)).toBe('b');
    });
    it('trimStrings 含空串项 → 跳过（falsy）不影响', () => {
      const script = mk('/abc/', '{{match}}', ['']);
      expect(applyRegexScript('abc', script)).toBe('abc');
    });
    it('trimStrings 空数组 → 不影响', () => {
      const script = mk('/abc/', '{{match}}', []);
      expect(applyRegexScript('abc', script)).toBe('abc');
    });
    it('trimStrings 对捕获组也修剪', () => {
      const script = mk('/(axb)/', '$1', ['x']);
      expect(applyRegexScript('axb', script)).toBe('ab');
    });
    it('trimStrings 删除所有出现（非仅首个）', () => {
      const script = mk('aa', '{{match}}', ['a']);
      // aa �剪掉所有 a 后为空
      expect(applyRegexScript('aa', script)).toBe('');
    });
  });

  describe('replaceString 缺失容错', () => {
    it('replaceString 运行时为 undefined → 视为空串', () => {
      const script = mk('/abc/', undefined as unknown as string);
      // script.replaceString ?? '' → ''
      expect(applyRegexScript('abc', script)).toBe('');
    });
    it('replaceString 运行时为 null → 视为空串', () => {
      const script = mk('/abc/', null as unknown as string);
      expect(applyRegexScript('abc', script)).toBe('');
    });
  });

  describe('命名捕获组摘除', () => {
    it('正则含命名组时末尾对象被摘除，$n 仍按数字位置取', () => {
      const script = mk('/(?<word>a)(b)/', '$1-$2');
      expect(applyRegexScript('ab', script)).toBe('a-b');
    });
    it('命名组 + {{match}}', () => {
      const script = mk('/(?<w>a)/', '{{match}}');
      expect(applyRegexScript('a', script)).toBe('a');
    });
  });

  describe('$ 特殊序列字面保留', () => {
    it('$& 原样保留（function 返回值字面使用）', () => {
      const script = mk('/abc/', '$&');
      expect(applyRegexScript('abc', script)).toBe('$&');
    });
    it('$$ 原样保留', () => {
      const script = mk('/abc/', '$$');
      expect(applyRegexScript('abc', script)).toBe('$$');
    });
  });

  describe('多匹配独立回调', () => {
    it('强制 g 对每个匹配独立回调各自替换', () => {
      const script = mk('a', '[$0]');
      // 捕获组为空 → $0 也是空
      expect(applyRegexScript('aaa', script)).toBe('[][][]');
    });
    it('多匹配各段含捕获组', () => {
      const script = mk('(\\d)', '$1');
      expect(applyRegexScript('1a2b3', script)).toBe('1a2b3');
    });
  });
});
