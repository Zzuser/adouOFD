#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const localJdk = join(root, '.tools', 'jdk-25')
const javaHome = existsSync(join(localJdk, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))
  ? localJdk
  : process.env.JAVA_HOME

if (!javaHome) {
  console.error('未找到 JDK 25。请先运行 node scripts/setup-jdk.mjs，或设置 JAVA_HOME。')
  process.exit(1)
}

const isWindows = process.platform === 'win32'
const maven = isWindows ? 'mvn.cmd' : 'mvn'
const result = spawnSync(maven, ['-B', '-DskipTests', 'clean', 'package'], {
  cwd: join(root, 'backend'),
  stdio: 'inherit',
  shell: isWindows,
  env: { ...process.env, JAVA_HOME: javaHome }
})

if (result.error) {
  console.error(`无法执行 Maven：${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
