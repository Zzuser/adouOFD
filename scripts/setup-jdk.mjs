#!/usr/bin/env node
/**
 * 下载项目内 JDK 25 LTS（Temurin 25.0.5+8），不修改系统环境。
 * 仅支持 Windows x64（当前产品目标），下载后解压到 .tools/jdk-25。
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const toolsDir = join(root, '.tools')
const targetDir = join(toolsDir, 'jdk-25')
const javaExe = join(targetDir, 'bin', 'java.exe')
const archive = join(toolsDir, 'temurin-25.zip')

const URL = 'https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.5%2B8/OpenJDK25U-jdk_x64_windows_hotspot_25.0.5_8.zip'
const SHA256 = '636bdc13dc649ddc7d5921c5c7d23cca6e44fd19d662b45cc9c02135a6c96c42'

if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.error('当前脚本仅支持 Windows x64。')
  process.exit(1)
}

if (existsSync(javaExe)) {
  const version = spawnSync(javaExe, ['-version'], { encoding: 'utf8' })
  console.log('JDK 已存在：', (version.stderr || version.stdout).split('\n')[0])
  process.exit(0)
}

mkdirSync(toolsDir, { recursive: true })
console.log('正在下载 Temurin JDK 25.0.5（约 135 MB）…')
const response = await fetch(URL, { redirect: 'follow' })
if (!response.ok || !response.body) {
  console.error(`下载失败：HTTP ${response.status}`)
  process.exit(1)
}

const file = createWriteStream(archive)
const hash = createHash('sha256')
for await (const chunk of response.body) {
  hash.update(chunk)
  if (!file.write(chunk)) {
    await new Promise((resolveDrain) => file.once('drain', resolveDrain))
  }
}
await new Promise((resolveEnd) => file.end(resolveEnd))

const actual = hash.digest('hex')
if (actual !== SHA256) {
  rmSync(archive, { force: true })
  console.error(`SHA256 校验失败：期望 ${SHA256}，实际 ${actual}`)
  process.exit(1)
}

console.log('校验通过，正在解压…')
const extractDir = join(toolsDir, 'jdk-extract')
rmSync(extractDir, { recursive: true, force: true })
mkdirSync(extractDir, { recursive: true })
const tar = spawnSync('tar', ['-xf', archive, '-C', extractDir], { stdio: 'inherit' })
if (tar.status !== 0) {
  console.error('解压失败，请确认系统自带 tar 可用。')
  process.exit(1)
}
const extracted = readdirSync(extractDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(extractDir, entry.name))[0]
if (!extracted) {
  console.error('未找到解压后的 JDK 目录。')
  process.exit(1)
}
rmSync(targetDir, { recursive: true, force: true })
renameSync(extracted, targetDir)
rmSync(extractDir, { recursive: true, force: true })
rmSync(archive, { force: true })

const check = spawnSync(javaExe, ['-version'], { encoding: 'utf8' })
console.log('完成：', (check.stderr || check.stdout).split('\n')[0])
