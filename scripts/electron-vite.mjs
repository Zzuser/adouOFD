#!/usr/bin/env node
/**
 * electron-vite 启动包装器：清除 ELECTRON_RUN_AS_NODE，
 * 避免部分终端环境把 Electron 误当成 Node 运行。
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(root, 'desktop')
const cli = join(desktop, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: desktop,
  stdio: 'inherit',
  env
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
