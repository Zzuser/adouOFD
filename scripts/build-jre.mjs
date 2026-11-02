#!/usr/bin/env node
/**
 * 用 jlink 生成安装包内置的精简 JRE。
 *
 * 模块清单来自 jdeps 分析后端 fat jar（BOOT-INF/lib + classes），
 * 另补 jdk.charsets（GBK/GB18030）与 jdk.localedata（中文区域数据）。
 * 前置：先运行 npm run backend:build 生成 backend/target/adou-ofd-backend.jar。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'
const exe = isWindows ? '.exe' : ''
const localJdk = join(root, '.tools', 'jdk-25')
const javaHome = existsSync(join(localJdk, 'bin', `java${exe}`)) ? localJdk : process.env.JAVA_HOME
const jlink = javaHome ? join(javaHome, 'bin', `jlink${exe}`) : null
const jar = join(root, 'backend', 'target', 'adou-ofd-backend.jar')
const output = join(root, 'backend', 'target', 'jre')

const modules = [
  'java.base',
  'java.compiler',
  'java.desktop',
  'java.instrument',
  'java.management',
  'java.naming',
  'java.net.http',
  'java.prefs',
  'java.scripting',
  'java.security.jgss',
  'java.sql',
  'java.xml',
  'jdk.charsets',
  'jdk.crypto.ec',
  'jdk.jfr',
  'jdk.localedata',
  'jdk.unsupported'
]

if (!jlink || !existsSync(jlink)) {
  console.error('未找到 JDK 25。请先运行 node scripts/setup-jdk.mjs，或设置 JAVA_HOME。')
  process.exit(1)
}
if (!existsSync(jar)) {
  console.error(`未找到后端 jar：${jar}\n请先运行 npm run backend:build。`)
  process.exit(1)
}

rmSync(output, { recursive: true, force: true })
const result = spawnSync(
  jlink,
  [
    '--add-modules',
    modules.join(','),
    '--include-locales=zh,en',
    '--compress=zip-6',
    '--strip-debug',
    '--no-header-files',
    '--no-man-pages',
    '--output',
    output
  ],
  { stdio: 'inherit' }
)
if (result.error || result.status !== 0) {
  console.error(`jlink 失败：${result.error?.message ?? `退出码 ${result.status}`}`)
  process.exit(1)
}

const imageJava = join(output, 'bin', `java${exe}`)
const version = spawnSync(imageJava, ['-version'], { encoding: 'utf8' })
if (version.status !== 0) {
  console.error(`裁剪后的 JRE 无法运行：${version.stderr || version.stdout}`)
  process.exit(1)
}
const listed = spawnSync(imageJava, ['--list-modules'], { encoding: 'utf8' })
for (const required of ['java.desktop', 'java.xml', 'jdk.charsets', 'jdk.localedata']) {
  if (!listed.stdout.includes(required)) {
    console.error(`裁剪后的 JRE 缺少模块：${required}`)
    process.exit(1)
  }
}

const sizeMb = (statSync(join(output, 'lib', 'modules')).size / 1024 / 1024).toFixed(1)
console.log(`JRE 已生成：${output}（modules ${sizeMb} MB）`)
console.log(version.stderr.trim().split(/\r?\n/)[0])
