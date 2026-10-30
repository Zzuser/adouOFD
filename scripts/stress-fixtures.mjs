#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backend = join(root, 'backend')
const javaHome = join(root, '.tools', 'jdk-25')
const java = join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
const maven = process.platform === 'win32' ? 'mvn.cmd' : 'mvn'
const outputDir = process.argv[2] ?? join(root, '.tools', 'stress')
const cpFile = join(root, '.tools', 'stress-cp.txt')

if (!existsSync(java)) {
  console.error('缺少项目内 JDK，请先运行 node scripts/setup-jdk.mjs')
  process.exit(1)
}
mkdirSync(outputDir, { recursive: true })

const compile = spawnSync(
  maven,
  ['-q', '-DskipTests', 'test-compile', 'dependency:build-classpath', `-Dmdep.outputFile=${cpFile}`],
  {
    cwd: backend,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, JAVA_HOME: javaHome }
  }
)
if (compile.status !== 0) {
  console.error('编译压力测试夹具失败')
  process.exit(compile.status ?? 1)
}

const dependencies = readFileSync(cpFile, 'utf8').trim()
const classPath = [
  join(backend, 'target', 'classes'),
  join(backend, 'target', 'test-classes'),
  dependencies
].join(delimiter)

console.log('正在生成大文件，可能需要数十秒…')
const run = spawnSync(
  java,
  [
    '-Xmx1200m',
    '-Djava.awt.headless=true',
    '-cp',
    classPath,
    'com.adou.ofd.StressFixtureGenerator',
    outputDir
  ],
  {
    cwd: backend,
    stdio: 'inherit',
    env: { ...process.env, JAVA_HOME: javaHome }
  }
)
process.exit(run.status ?? 1)
