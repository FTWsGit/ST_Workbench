// 脱离 Vue 单独验证 worldbookApi.ts 的 importCharacterBookEntries()（角色卡内嵌世界书 → 独立
// 世界书条目转换）。跑法：npx tsx scripts/test-import-character-book.ts
import { importCharacterBookEntries } from '../src/api/worldbookApi'

function assertEq(actual: any, expected: any, msg: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    console.error(`FAIL: ${msg}\n  actual:   ${a}\n  expected: ${e}`)
    process.exitCode = 1
  } else {
    console.log(`ok: ${msg}`)
  }
}

// Case 1：只有 Character Card V2 规范字段，没有 extensions（第三方工具生成的卡最常见的样子）
{
  const [entry] = importCharacterBookEntries([
    {
      id: 3,
      keys: ['龙', '巨龙'],
      secondary_keys: [],
      comment: '龙的设定',
      content: '一只古老的赤红巨龙。',
      constant: false,
      selective: false,
      insertion_order: 10,
      enabled: true,
      position: 'after_char',
    },
  ])
  assertEq(entry.uid, 3, 'spec-only: uid 取自 id')
  assertEq(entry.keys, ['龙', '巨龙'], 'spec-only: keys 取自 keys')
  assertEq(entry.disabled, false, 'spec-only: enabled=true → disabled=false')
  assertEq(entry.position, 1, "spec-only: position 'after_char' → 1")
  assertEq(entry.order, 10, 'spec-only: order 取自 insertion_order')
  assertEq(entry.keyWord, true, 'spec-only: 非 constant/vectorized → keyWord')
  assertEq(entry.probability, 100, 'spec-only: probability 落到默认值 100')
  assertEq(entry.scanDepth, null, 'spec-only: scanDepth 落到默认值 null')
}

// Case 2：带 ST 自己写的 extensions（ST 导出角色卡内嵌世界书时的真实样子），extensions 优先于规范字段
{
  const [entry] = importCharacterBookEntries([
    {
      id: 0,
      keys: ['雨林'],
      secondary_keys: ['潮湿'],
      comment: '雨林场景',
      content: '常年潮湿闷热的雨林。',
      constant: true,
      selective: true,
      insertion_order: 100,
      enabled: false, // 会被 extensions.disable 覆盖判断
      position: 'before_char',
      extensions: {
        position: 4, // at_depth，规范字段 before_char 只能表达 0，这里验证 extensions 优先
        depth: 7,
        probability: 55,
        useProbability: true,
        order: 250,
        sticky: 3,
        cooldown: null,
        group: 'scene',
        groupOverride: true,
        groupWeight: 20,
        role: 2,
        selectiveLogic: 3,
        vectorized: false,
      },
    },
  ])
  assertEq(entry.position, 4, 'extensions: position 4 优先于规范字段推出的 0')
  assertEq(entry.depth, 7, 'extensions: depth 透传')
  assertEq(entry.probability, 55, 'extensions: probability 透传')
  assertEq(entry.order, 250, 'extensions: order 优先于 insertion_order')
  assertEq(entry.sticky, 3, 'extensions: sticky 透传')
  assertEq(entry.group, 'scene', 'extensions: group 透传')
  assertEq(entry.groupPrioritized, true, 'extensions: groupOverride → groupPrioritized')
  assertEq(entry.role, 2, 'extensions: role 透传')
  assertEq(entry.selectiveLogic, 3, 'extensions: selectiveLogic 透传')
  assertEq(entry.constant, true, 'extensions: constant 沿用规范字段（extensions 未覆盖）')
  assertEq(entry.keyWord, false, 'extensions: constant=true → keyWord=false')
}

// Case 3：缺 id 时用数组下标兜底，且不会跟其它有 id 的条目冲突处理上保持简单（各自独立编号）
{
  const entries = importCharacterBookEntries([
    { keys: ['a'], content: 'A' },
    { keys: ['b'], content: 'B' },
  ])
  assertEq(entries.map(e => e.uid), [0, 1], 'missing id: 用下标兜底')
}

// Case 4：空/undefined 输入不炸
{
  assertEq(importCharacterBookEntries(undefined), [], 'undefined entries → 空数组')
  assertEq(importCharacterBookEntries(null), [], 'null entries → 空数组')
  assertEq(importCharacterBookEntries([]), [], '空数组 → 空数组')
}

if (process.exitCode === 1) {
  console.error('\n有用例失败')
} else {
  console.log('\n全部通过')
}
