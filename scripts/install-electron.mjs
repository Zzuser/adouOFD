#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronDir = join(root, 'desktop', 'node_modules', 'electron')
const dist = join(electronDir, 'dist')

if (!existsSync(electronDir)) {
  process.exit(0)
}
if (existsSync(dist)) {
  process.exit(0)
}

console.log('下载 Electron 运行时 …')
const result = spawnSync(process.execPath, [join(electronDir, 'install.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/'
  }
})
process.exit(result.status ?? 1)
