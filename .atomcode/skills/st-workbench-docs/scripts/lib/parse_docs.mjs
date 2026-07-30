// 共享 front matter 解析：list/print/sync 三个入口复用，不重复解析逻辑。
// 只认 YAML front matter（--- 包围），取 name/description/alwaysApply 三字段。
// alwaysApply 缺省视为 false。front matter 不合法 → 跳过文件并 stderr warn，不挂掉整批。

import fs from 'node:fs'
import path from 'node:path'

/** 解析单个 .mdc 文件的 front matter。失败返回 null 并 warn。 */
function parseFile(filePath) {
  let text
  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch (e) {
    process.stderr.write(`warn: cannot read ${filePath}: ${e.message}\n`)
    return null
  }

  // front matter 必须在文件最开头，由一行 `---` 开始
  const lines = text.split(/\r?\n/)
  if (lines[0] !== '---') {
    process.stderr.write(`warn: ${filePath} has no front matter\n`)
    return null
  }
  const endIdx = lines.indexOf('---', 1)
  if (endIdx < 0) {
    process.stderr.write(`warn: ${filePath} front matter not terminated\n`)
    return null
  }

  const fm = {}
  for (let i = 1; i < endIdx; i++) {
    const line = lines[i]
    const m = /^(\w+):\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    // description 多半带引号；剥掉外层配对引号
    if (/^["'].*["']$/.test(val)) val = val.slice(1, -1)
    fm[key] = val
  }
  if (!fm.name) {
    process.stderr.write(`warn: ${filePath} missing required field: name\n`)
    return null
  }
  const alwaysRaw = fm.alwaysApply?.toLowerCase()
  fm.alwaysApply = alwaysRaw === 'true' || alwaysRaw === '1'
  // description 缺省回退空串（list 输出仍可用，下游判断 hasDescription）
  fm.description = fm.description ?? ''
  return fm
}

/** 枚举 dir 下所有 .mdc 文件，解析 front matter，alwaysApply:true 优先、然后按文件名排序。 */
export function listDocs(dir = '.doc') {
  let names
  try {
    names = fs.readdirSync(dir).filter(n => n.endsWith('.mdc'))
  } catch (e) {
    process.stderr.write(`error: cannot readdir ${dir}: ${e.message}\n`)
    process.exit(1)
  }
  const parsed = names.map(n => {
    const fm = parseFile(path.join(dir, n))
    return fm ? { file: n, ...fm } : null
  }).filter(Boolean)
  parsed.sort((a, b) => {
    if (a.alwaysApply !== b.alwaysApply) return a.alwaysApply ? -1 : 1
    return a.file < b.file ? -1 : a.file > b.file ? 1 : 0
  })
  return parsed
}

/** 读单个文件的完整内容（含 front matter），供 print_always 拼接用。 */
export function readFull(filePath) {
  try { return fs.readFileSync(filePath, 'utf8') }
  catch (e) {
    process.stderr.write(`warn: cannot read ${filePath}: ${e.message}\n`)
    return ''
  }
}
