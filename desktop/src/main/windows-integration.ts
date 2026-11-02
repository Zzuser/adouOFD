import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { WindowsIntegrationStatus } from '../shared/types'

const execFileAsync = promisify(execFile)

const APP_KEY = 'AdouOFD'
const APP_DESCRIPTION = '免费、离线的 OFD / PDF 查看与处理工具'
const REGISTERED_APPLICATIONS = 'Software\\RegisteredApplications'
const CAPABILITIES_KEY = `Software\\${APP_KEY}\\Capabilities`
const CONFIG_FILE = 'windows-integration.json'
const LEGACY_PROG_ID = 'AdouOFD.Document'

interface FileType {
  extension: 'ofd' | 'pdf'
  progId: string
  typeName: string
  iconFile: string
}

const FILE_TYPES: FileType[] = [
  {
    extension: 'ofd',
    progId: 'AdouOFD.OFD',
    typeName: 'OFD 文档',
    iconFile: 'ofd-file.ico'
  },
  {
    extension: 'pdf',
    progId: 'AdouOFD.PDF',
    typeName: 'PDF 文档',
    iconFile: 'pdf-file.ico'
  }
]
const OUR_PROG_IDS = [...FILE_TYPES.map((type) => type.progId), LEGACY_PROG_ID]
const DEFAULT_EXTENSION = 'ofd'

interface IntegrationConfig {
  optedOut?: boolean
  registeredPath?: string
  previousOfdDefault?: string
}

function isWindows(): boolean {
  return process.platform === 'win32'
}

function configPath(): string {
  return join(app.getPath('userData'), CONFIG_FILE)
}

function readConfig(): IntegrationConfig {
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8')) as IntegrationConfig
  } catch {
    return {}
  }
}

function writeConfig(config: IntegrationConfig): void {
  try {
    writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  } catch (error) {
    console.warn('[windows] 无法保存文件关联配置', error)
  }
}

async function reg(args: string[]): Promise<void> {
  await execFileAsync('reg.exe', args, { windowsHide: true })
}

async function regQuery(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('reg.exe', args, {
      windowsHide: true,
      encoding: 'utf8'
    })
    return String(stdout)
  } catch {
    return null
  }
}

function add(key: string, ...values: string[]): Promise<void> {
  return reg(['add', key, ...values, '/f'])
}

async function deleteValue(key: string, value: string): Promise<void> {
  try {
    await reg(['delete', key, '/v', value, '/f'])
  } catch {
    // 值不存在时忽略
  }
}

async function deleteKey(key: string): Promise<void> {
  try {
    await reg(['delete', key, '/f'])
  } catch {
    // 键不存在时忽略
  }
}

async function deleteDefault(key: string): Promise<void> {
  try {
    await reg(['delete', key, '/ve', '/f'])
  } catch {
    // 默认值不存在时忽略
  }
}

async function refreshShellIcons(): Promise<void> {
  try {
    await execFileAsync('ie4uinit.exe', ['-show'], { windowsHide: true })
  } catch {
    // 刷新失败不影响注册结果，资源管理器重启后同样生效
  }
}

function fileIconPath(iconFile: string): string {
  const root = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'build')
  return join(root, 'fileicons', iconFile)
}

function defaultIconValue(iconFile: string): string {
  const icon = fileIconPath(iconFile)
  return existsSync(icon) ? `"${icon}",0` : `"${process.execPath}",0`
}

async function commandRegistered(progId: string): Promise<boolean> {
  const output = await regQuery([
    'query',
    `HKCU\\Software\\Classes\\${progId}\\shell\\open\\command`,
    '/ve'
  ])
  return output !== null
}

async function openWithRegistered(extension: string, progId: string): Promise<boolean> {
  const output = await regQuery([
    'query',
    `HKCU\\Software\\Classes\\.${extension}\\OpenWithProgids`,
    '/v',
    progId
  ])
  return output !== null
}

async function readUserChoice(extension: string): Promise<string> {
  const output = await regQuery([
    'query',
    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.${extension}\\UserChoice`,
    '/v',
    'ProgId'
  ])
  if (!output) return ''
  const match = output.match(/ProgId\s+REG_\w+\s+([^\r\n]*)/i)
  return match ? match[1].trim() : ''
}

function isOurProgId(value: string): boolean {
  return OUR_PROG_IDS.includes(value)
}

async function userChoiceIsOurs(extension: string): Promise<boolean> {
  return isOurProgId(await readUserChoice(extension))
}

async function hasUserChoice(extension: string): Promise<boolean> {
  const output = await regQuery([
    'query',
    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.${extension}\\UserChoice`,
    '/v',
    'ProgId'
  ])
  return output !== null
}

async function readDefaultProgId(extension: string): Promise<string> {
  const output = await regQuery(['query', `HKCU\\Software\\Classes\\.${extension}`, '/ve'])
  if (!output) return ''
  const match = output.match(/REG_(?:EXPAND_)?SZ\s+([^\r\n]*)/)
  return match ? match[1].trim() : ''
}

async function isDefaultFor(extension: string): Promise<boolean> {
  const choice = await readUserChoice(extension)
  if (choice) {
    return isOurProgId(choice)
  }
  return isOurProgId(await readDefaultProgId(extension))
}

export async function getWindowsIntegration(): Promise<WindowsIntegrationStatus> {
  const supported = isWindows()
  const packaged = app.isPackaged
  if (!supported) {
    return {
      supported,
      packaged,
      canRegister: false,
      registered: false,
      ofdDefault: false,
      pdfDefault: false,
      optedOut: false
    }
  }
  const [fileTypesRegistered, ofdDefault, pdfDefault] = await Promise.all([
    Promise.all(
      FILE_TYPES.map(async (type) => {
        const command = await commandRegistered(type.progId)
        const openWith = await openWithRegistered(type.extension, type.progId)
        return command && openWith
      })
    ),
    isDefaultFor('ofd'),
    isDefaultFor('pdf')
  ])
  return {
    supported,
    packaged,
    canRegister: packaged,
    registered: fileTypesRegistered.every(Boolean),
    ofdDefault,
    pdfDefault,
    optedOut: readConfig().optedOut === true
  }
}

/**
 * 每用户注册（HKCU），不修改机器级 HKLM，也不抢占已存在的 PDF 默认应用：
 * - ProgID + .ofd/.pdf 的 OpenWithProgids → 出现在“打开方式”；
 * - RegisteredApplications / Capabilities → 出现在 Windows 默认应用设置；
 * - .ofd 写入扩展默认值，系统尚未记录 UserChoice 时可直接双击打开。
 */
export async function registerFileAssociations(): Promise<WindowsIntegrationStatus> {
  if (!isWindows()) {
    throw new Error('当前系统不支持 Windows 文件关联')
  }
  if (!app.isPackaged) {
    throw new Error('开发模式不写入注册表，请使用安装版')
  }
  const exe = process.execPath
  const command = `"${exe}" "%1"`
  const config = readConfig()
  let previousOfdDefault = config.previousOfdDefault

  for (const type of FILE_TYPES) {
    const progKey = `HKCU\\Software\\Classes\\${type.progId}`
    await add(progKey, '/ve', '/d', type.typeName)
    await add(progKey, '/v', 'FriendlyTypeName', '/d', type.typeName)
    await add(progKey, '/v', 'Application', '/d', '阿豆OFD')
    await add(`${progKey}\\DefaultIcon`, '/ve', '/d', defaultIconValue(type.iconFile))
    await add(`${progKey}\\shell`, '/ve', '/d', 'open')
    await add(`${progKey}\\shell\\open`, '/ve', '/d', '用阿豆OFD打开')
    await add(`${progKey}\\shell\\open\\command`, '/ve', '/d', command)

    const extensionKey = `HKCU\\Software\\Classes\\.${type.extension}`
    await add(`${extensionKey}\\OpenWithProgids`, '/v', type.progId, '/t', 'REG_NONE', '/d', '')
    if (type.extension === DEFAULT_EXTENSION && !(await hasUserChoice(type.extension))) {
      const current = await readDefaultProgId(type.extension)
      if (current && !isOurProgId(current)) {
        previousOfdDefault = current
      }
      await add(extensionKey, '/ve', '/d', type.progId)
    }
  }

  // 迁移临时版本使用过的单一 ProgID，避免“打开方式”里出现重复项
  for (const type of FILE_TYPES) {
    await deleteValue(
      `HKCU\\Software\\Classes\\.${type.extension}\\OpenWithProgids`,
      LEGACY_PROG_ID
    )
  }
  const legacyInUse =
    (await readUserChoice('ofd')) === LEGACY_PROG_ID ||
    (await readUserChoice('pdf')) === LEGACY_PROG_ID
  if (!legacyInUse) {
    await deleteKey(`HKCU\\Software\\Classes\\${LEGACY_PROG_ID}`)
  }

  const capabilities = `HKCU\\${CAPABILITIES_KEY}`
  await add(capabilities, '/v', 'ApplicationName', '/d', '阿豆OFD')
  await add(capabilities, '/v', 'ApplicationDescription', '/d', APP_DESCRIPTION)
  await add(capabilities, '/v', 'ApplicationIcon', '/d', `"${exe}",0`)
  for (const type of FILE_TYPES) {
    await add(`${capabilities}\\FileAssociations`, '/v', `.${type.extension}`, '/d', type.progId)
  }
  await add(`HKCU\\${REGISTERED_APPLICATIONS}`, '/v', APP_KEY, '/d', CAPABILITIES_KEY)
  await add(`HKCU\\Software\\${APP_KEY}`, '/v', 'PreviousOfdDefault', '/d', previousOfdDefault ?? '')

  writeConfig({
    ...config,
    optedOut: false,
    registeredPath: exe,
    previousOfdDefault
  })
  await refreshShellIcons()
  return getWindowsIntegration()
}

export async function unregisterFileAssociations(): Promise<WindowsIntegrationStatus> {
  if (!isWindows()) {
    throw new Error('当前系统不支持 Windows 文件关联')
  }
  if (!app.isPackaged) {
    throw new Error('开发模式不写入注册表，请使用安装版')
  }
  if ((await userChoiceIsOurs('ofd')) || (await userChoiceIsOurs('pdf'))) {
    throw new Error('Windows 仍将阿豆OFD设为默认应用，请先在“默认应用”中更换后再移除')
  }

  const config = readConfig()
  for (const progId of OUR_PROG_IDS) {
    await deleteKey(`HKCU\\Software\\Classes\\${progId}`)
  }
  for (const type of FILE_TYPES) {
    for (const progId of OUR_PROG_IDS) {
      await deleteValue(
        `HKCU\\Software\\Classes\\.${type.extension}\\OpenWithProgids`,
        progId
      )
    }
    if (type.extension === DEFAULT_EXTENSION) {
      const current = await readDefaultProgId(type.extension)
      if (isOurProgId(current)) {
        const extensionKey = `HKCU\\Software\\Classes\\.${type.extension}`
        if (config.previousOfdDefault && !isOurProgId(config.previousOfdDefault)) {
          await add(extensionKey, '/ve', '/d', config.previousOfdDefault)
        } else {
          await deleteDefault(extensionKey)
        }
      }
    }
  }
  await deleteKey(`HKCU\\${CAPABILITIES_KEY}`)
  await deleteValue(`HKCU\\${REGISTERED_APPLICATIONS}`, APP_KEY)
  await deleteKey(`HKCU\\Software\\${APP_KEY}`)

  writeConfig({
    ...config,
    optedOut: true,
    registeredPath: undefined,
    previousOfdDefault: undefined
  })
  await refreshShellIcons()
  return getWindowsIntegration()
}

export async function ensureRegisteredOnStartup(): Promise<void> {
  if (!isWindows() || !app.isPackaged) return
  const config = readConfig()
  if (config.optedOut) return
  try {
    const status = await getWindowsIntegration()
    if (status.registered && config.registeredPath === process.execPath) return
    await registerFileAssociations()
  } catch (error) {
    console.warn('[windows] 自动注册文件关联失败', error)
  }
}

/**
 * Windows 不允许静默修改默认应用；用“打开方式”对话框让用户自行确认，
 * 这是双击直接打开最直接的入口。
 */
export async function openDefaultAppChoice(): Promise<void> {
  if (!isWindows()) return
  const sample = join(tmpdir(), 'adou-ofd-association.ofd')
  try {
    writeFileSync(sample, '')
  } catch {
    // 示例文件仅用于唤起对话框
  }
  await execFileAsync('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', sample], {
    windowsHide: true
  })
  await refreshShellIcons()
}
