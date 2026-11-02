import { app, shell } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LegalNotices } from '../shared/types'

function noticesRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'notices')
  }
  return join(app.getAppPath(), '..')
}

function readText(candidates: string[], fallback: string): string {
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        return readFileSync(candidate, 'utf8')
      }
    } catch {
      // 尝试下一个候选路径
    }
  }
  return fallback
}

export function readLegalNotices(): LegalNotices {
  const root = noticesRoot()
  const thirdParty = readText(
    [
      join(root, 'THIRD-PARTY-NOTICES.md'),
      join(root, '..', 'THIRD-PARTY-NOTICES.md')
    ],
    '未找到第三方许可声明文件。'
  )
  const license = readText(
    [join(root, 'LICENSE.txt'), join(root, 'LICENSE'), join(root, '..', 'LICENSE')],
    '未找到应用许可文件。'
  )
  return { thirdParty, license, noticesDir: root }
}

export async function revealLegalNotices(): Promise<void> {
  const root = noticesRoot()
  if (!existsSync(root)) return
  const result = await shell.openPath(root)
  if (result) {
    shell.showItemInFolder(join(root, 'THIRD-PARTY-NOTICES.md'))
  }
}
