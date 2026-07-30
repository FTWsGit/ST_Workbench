// 入口：枚举 .doc front matter，stdout 输出 JSON 数组。
// 每项 {file, name, description, alwaysApply}。alwaysApply:true 优先、然后按文件名。
// 用法：node scripts/list_docs.mjs [--dir <path>]

import { listDocs } from './lib/parse_docs.mjs'

const args = process.argv.slice(2)
let dir = '.doc'
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) { dir = args[++i]; continue }
}

const docs = listDocs(dir)
process.stdout.write(JSON.stringify(docs, null, 2) + '\n')
