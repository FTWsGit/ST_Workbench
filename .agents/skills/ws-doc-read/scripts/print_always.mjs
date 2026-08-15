// 入口：堆读 alwaysApply:true 文档完整内容，stdout 输出纯文本。
// SKILL.md 的 Phase 1 赑它一次性把所有核心文档读进上下文，省 N 次 read_file。
// 用法：node scripts/print_always.mjs [--dir <path>]

import path from 'node:path'
import { listDocs, readFull } from './lib/parse_docs.mjs'

const args = process.argv.slice(2)
let dir = '.doc'
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) { dir = args[++i]; continue }
}

const always = listDocs(dir).filter(d => d.alwaysApply)
if (always.length === 0) {
  process.stderr.write('warn: no alwaysApply:true docs found\n')
  process.exit(0)
}
let out = ''
for (const d of always) {
  out += `=== ${d.file} ===\n`
  out += readFull(path.join(dir, d.file))
  out += '\n\n'
}
process.stdout.write(out)
