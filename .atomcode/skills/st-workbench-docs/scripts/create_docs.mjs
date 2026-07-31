// 入口：脚手架生成一个新的 .doc/*.mdc 文档，frontmatter 字段（name/description/alwaysApply）齐全。
// 解决的问题：手写 .mdc 容易漏 frontmatter 或漏 name 字段——parse_docs.mjs 对这两种情况都是
// 静默跳过（stderr warn + 从 list/print/sync 里消失），漏了不容易第一时间发现。
// 生成后立刻用 lib/parse_docs.mjs 的 parseFile() 自检一遍，跟 list_docs/print_always/sync_project_doc
// 用的是同一份解析逻辑——不只信自己拼的模板对不对。
//
// 用法：
//   node scripts/create_docs.mjs <name> "<description>" [--always] [--dir <path>] [--force]
//
//   <name>         文档名，同时用作文件名（<name>.mdc）和 frontmatter 的 name 字段，不要带 .mdc 后缀
//   <description>  "何时读"，必须是单行纯文本（frontmatter 解析器不支持多行值）；
//                   出现双引号会被自动替换成单引号并 warn——frontmatter 用双引号包裹整体，
//                   解析器不是真 YAML、不支持转义，双引号会提前把值截断
//   --always       设置 alwaysApply: true（默认 false）
//   --dir <path>   目标目录，默认 .doc
//   --force        目标文件已存在时允许覆盖（默认拒绝，防止手滑覆盖已有文档）

import fs from 'node:fs'
import path from 'node:path'
import { parseFile } from './lib/parse_docs.mjs'

const args = process.argv.slice(2)
const positional = []
let dir = '.doc'
let always = false
let force = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) { dir = args[++i]; continue }
  if (args[i] === '--always') { always = true; continue }
  if (args[i] === '--force') { force = true; continue }
  positional.push(args[i])
}

const [name, description] = positional
if (!name || !description) {
  process.stderr.write(
    'usage: node create_docs.mjs <name> "<description>" [--always] [--dir <path>] [--force]\n'
  )
  process.exit(1)
}
if (/[\r\n]/.test(description)) {
  process.stderr.write('error: description 必须是单行，不支持换行（frontmatter 解析器不认多行值）\n')
  process.exit(1)
}
if (/\.mdc$/i.test(name)) {
  process.stderr.write('error: <name> 不要带 .mdc 后缀，脚本会自动加\n')
  process.exit(1)
}
if (name.includes('"')) {
  process.stderr.write('error: name 不能含双引号\n')
  process.exit(1)
}

let safeDescription = description
if (safeDescription.includes('"')) {
  safeDescription = safeDescription.replaceAll('"', "'")
  process.stderr.write(
    'warn: description 里的双引号已自动替换成单引号（frontmatter 用双引号包裹整体，解析器不支持转义）\n'
  )
}

if (!fs.existsSync(dir)) {
  process.stderr.write(`error: 目录 ${dir} 不存在\n`)
  process.exit(1)
}

const fileName = `${name}.mdc`
const filePath = path.join(dir, fileName)

if (fs.existsSync(filePath) && !force) {
  process.stderr.write(`error: ${filePath} 已存在，加 --force 才允许覆盖\n`)
  process.exit(1)
}

const body = `---
name: "${name}"
description: "${safeDescription}"
alwaysApply: ${always}
---

# ${name}

`

fs.writeFileSync(filePath, body)

// 自检：不信自己拼的模板，跟其它脚本用同一份 parseFile() 重新读一遍确认真的能被解析。
const check = parseFile(filePath)
if (!check) {
  process.stderr.write(`error: 生成的 ${filePath} 没能通过 frontmatter 自检，create_docs.mjs 本身可能有 bug\n`)
  process.exit(1)
}

process.stdout.write(`created ${filePath}\n`)
process.stdout.write(`  name: ${check.name}\n`)
process.stdout.write(`  description: ${check.description}\n`)
process.stdout.write(`  alwaysApply: ${check.alwaysApply}\n`)
process.stdout.write(
  '\n下一步：填正文内容，支持直接append到文件末尾\n'
)
