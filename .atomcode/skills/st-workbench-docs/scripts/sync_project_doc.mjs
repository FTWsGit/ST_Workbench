// 入口：按 .doc front matter 增量刷新 AGENTS.md 的 ## Project Doc 段表。
// 语义不是"重建表"，是"刷新现有表"——已存在行按原顺序刷新 description/alwaysApply，
// 新出现的 .mdc 追加表末（按 list_docs 排序：alwaysApply 优先、然后文件名），删掉的 doc 从表里去掉。
// 保留表前的引言段（"alwaysApply:true 的四个文件..."那行是给 AI 的行为约束不是数据）。
// 不动 AGENTS.md 的其它段。找不到 ## Project Doc 标头 → exit 1（说明 AGENTS.md 结构变了，需人介入）。
// 用法：node scripts/sync_project_doc.mjs [--dir <path>] [--agents <path>]

import fs from 'node:fs'
import { listDocs } from './lib/parse_docs.mjs'

const args = process.argv.slice(2)
let dir = '.doc'
let agents = 'AGENTS.md'
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) { dir = args[++i]; continue }
  if (args[i] === '--agents' && args[i + 1]) { agents = args[++i]; continue }
}

const docs = listDocs(dir)
const docByName = new Map(docs.map(d => [d.file, d]))

function rowFor(d) {
  const fileRef = '`' + dir + '/' + d.file + '`'
  const flag = d.alwaysApply ? 'true' : 'false'
  const when = d.description || ''
  return `| ${fileRef} | ${flag} | ${when} |`
}

const header = '| 文件 | alwaysApply | description |\n|------|------------|-------|'

let src
try { src = fs.readFileSync(agents, 'utf8') }
catch (e) {
  process.stderr.write(`error: cannot read ${agents}: ${e.message}\n`)
  process.exit(1)
}
const lines = src.split(/\r?\n/)
const segIdx = lines.findIndex(l => l === '## Project Doc')
if (segIdx < 0) {
  process.stderr.write(`error: ${agents} has no \`## Project Doc\` header — structure changed, needs human\n`)
  process.exit(1)
}

const tableStartIdx = lines.slice(segIdx).findIndex(l => /^\| 文件 \|/.test(l))
if (tableStartIdx < 0) {
  process.stderr.write(`error: ${agents} Project Doc segment has no table starting with \`| 文件 |\`\n`)
  process.exit(1)
}
const absStart = segIdx + tableStartIdx

// 收集现有表的文件名顺序（剥反引号 + dir/ 前缀），同时识别要删的行
const existingRows = []  // {file, rawLine}
let absEnd = absStart + 1
while (absEnd < lines.length && /^\|.*\|/.test(lines[absEnd])) {
  const m = /`([^`]+)`/.exec(lines[absEnd])
  if (m) {
    const full = m[1]
    const prefix = dir + '/'
    const file = full.startsWith(prefix) ? full.slice(prefix.length) : full
    existingRows.push({ file, rawLine: lines[absEnd] })
  }
  absEnd++
}
// 吃掉表末紧贴的空行（避免 sync 后累积空行）
while (absEnd < lines.length && lines[absEnd] === '' && lines[absEnd + 1] && !/^##\s/.test(lines[absEnd + 1])) {
  absEnd++
}

// 1. 已存在行按原顺序刷新；doc 已删则跳过（不进新表）
const keptRows = []
for (const r of existingRows) {
  const d = docByName.get(r.file)
  if (!d) continue  // doc 被删了，从表里去掉
  keptRows.push(rowFor(d))
}

// 2. 新出现的 doc（原表没有的）追加末尾——按 list_docs 排序
const existingSet = new Set(existingRows.map(r => r.file))
const appended = docs.filter(d => !existingSet.has(d.file)).map(rowFor)

const newBody = keptRows.concat(appended).join('\n')
const newSeg = header + '\n' + newBody + '\n'

const newLines = [...lines.slice(0, absStart), ...newSeg.split(/\r?\n/), ...lines.slice(absEnd)]
while (newLines.length > 0 && newLines[newLines.length - 1] === '') newLines.pop()
const out = newLines.join('\n') + '\n'

fs.writeFileSync(agents, out)
process.stdout.write(`synced ${agents} Project Doc segment (${docs.length} entries, ${appended.length} appended)\n`)
process.stdout.write(newSeg + '\n')
