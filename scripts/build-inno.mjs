import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(root, 'desktop')
const version = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')).version
const stage = mkdtempSync(join(tmpdir(), 'adou-inno-stage-'))
const sourceDir = join(stage, 'win-unpacked')
const outputDir = join(desktop, 'dist-inno')
const installer = join(outputDir, `阿豆OFD-${version}-x64-inno.exe`)

const isccCandidates = [
  process.env.INNO_SETUP_ISCC,
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe'
].filter(Boolean)
const iscc = isccCandidates.find((candidate) => existsSync(candidate))
if (!iscc) {
  console.error('未找到 Inno Setup 6 的 ISCC.exe；请安装 Inno Setup 6 或设置 INNO_SETUP_ISCC')
  process.exit(1)
}

const builderCli = join(desktop, 'node_modules', 'electron-builder', 'cli.js')
const builderEnv = { ...process.env }
const nodeOptions = String(builderEnv.NODE_OPTIONS ?? '')
if (!nodeOptions.includes('--use-system-ca')) {
  builderEnv.NODE_OPTIONS = `${nodeOptions} --use-system-ca`.trim()
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} 退出码 ${result.status ?? 'unknown'}`)
  }
}

try {
  mkdirSync(outputDir, { recursive: true })
  console.log(`准备 Inno 安装源：${stage}`)
  run(
    process.execPath,
    [
      builderCli,
      '--win',
      'dir',
      '--x64',
      `-c.directories.output=${stage}`,
      `-c.electronDist=${join(desktop, 'node_modules', 'electron', 'dist')}`
    ],
    { cwd: desktop, env: builderEnv }
  )

  if (!existsSync(join(sourceDir, '阿豆OFD.exe'))) {
    throw new Error(`未生成打包目录：${sourceDir}`)
  }

  // dxcompiler.dll（约 25MB）只被 Chromium 的 WebGPU/Dawn 用于把着色器编译成
  // HLSL；本应用不使用 WebGPU，Dawn 缺该库时只是 WebGPU 不可用，不会影响
  // 默认的 ANGLE/D3D 渲染路径（d3dcompiler_47.dll 保留）。
  const dxcompiler = join(sourceDir, 'dxcompiler.dll')
  if (existsSync(dxcompiler)) {
    const dxSize = (statSync(dxcompiler).size / 1024 / 1024).toFixed(1)
    rmSync(dxcompiler)
    console.log(`已移除 dxcompiler.dll（${dxSize} MB，未使用 WebGPU）`)
  }

  console.log('编译 Inno Setup 安装包…')
  run(
    iscc,
    [
      `/DAppVersion=${version}`,
      `/DSourceDir=${sourceDir}`,
      `/DOutputDir=${outputDir}`,
      `/DRepoRoot=${root}`,
      join(root, 'scripts', 'inno', 'adou-ofd.iss')
    ],
    { cwd: desktop }
  )

  if (!existsSync(installer)) {
    throw new Error(`未生成安装包：${installer}`)
  }
  const size = (statSync(installer).size / 1024 / 1024).toFixed(1)
  console.log(`Inno 安装包：${installer}（${size} MB）`)
} finally {
  rmSync(stage, { recursive: true, force: true })
}
