import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import type { BackendInfo } from '../shared/types'

const START_TIMEOUT_MS = 40_000

export class BackendManager {
  private child: ChildProcess | null = null
  private current: BackendInfo = { status: 'starting', port: null, token: null }
  private stopping = false
  private readonly listeners = new Set<(info: BackendInfo) => void>()
  private readonly recentLog: string[] = []
  private readonly logPath = join(app.getPath('userData'), 'logs', 'backend.log')

  get info(): BackendInfo {
    return { ...this.current, logPath: this.logPath }
  }

  onChange(listener: (info: BackendInfo) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(): Promise<void> {
    if (this.child) {
      await this.stop()
    }
    this.stopping = false
    this.emit({ status: 'starting', port: null, token: null, message: '正在启动本地引擎' })

    try {
      const port = await findFreePort()
      const token = randomBytes(24).toString('hex')
      const java = this.resolveJava()
      const jar = this.resolveJar()
      mkdirSync(dirname(this.logPath), { recursive: true })
      this.appendLog(`\n=== ${new Date().toISOString()} 启动引擎 ===\njava: ${java}\njar: ${jar}\nport: ${port}\n`)

      const args = [
        '-Djava.awt.headless=true',
        '-Dfile.encoding=UTF-8',
        '-Xms64m',
        '-Xmx768m',
        '-Xss2m',
        '-jar',
        jar,
        `--server.port=${port}`,
        `--adou.token=${token}`,
        '--spring.main.banner-mode=off',
        '--spring.application.name=adou-ofd-backend',
        '--logging.level.root=WARN'
      ]
      const child = spawn(java, args, {
        cwd: app.getPath('userData'),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.child = child

      child.stdout?.on('data', (data: Buffer) => this.appendLog(data.toString()))
      child.stderr?.on('data', (data: Buffer) => this.appendLog(data.toString()))
      child.on('error', (error) => {
        this.appendLog(`spawn error: ${error.message}\n`)
        this.emit({
          status: 'error',
          port: null,
          token: null,
          message: `无法启动本地引擎：${error.message}`
        })
      })
      child.on('exit', (code, signal) => {
        this.appendLog(`\n=== 引擎退出 code=${code} signal=${signal} ===\n`)
        if (this.child === child) {
          this.child = null
        }
        if (!this.stopping) {
          this.emit({
            status: 'error',
            port: null,
            token: null,
            message: `本地引擎意外退出（代码 ${code ?? signal ?? '未知'}）`
          })
        }
      })

      await this.waitForHealth(port, token)
      this.emit({ status: 'ready', port, token })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.appendLog(`启动失败: ${message}\n`)
      await this.terminate()
      this.emit({ status: 'error', port: null, token: null, message })
    }
  }

  async restart(): Promise<BackendInfo> {
    await this.stop()
    await this.start()
    return this.info
  }

  async stop(): Promise<void> {
    this.stopping = true
    const child = this.child
    this.child = null
    if (!child) {
      this.emit({ status: 'stopped', port: null, token: null })
      return
    }

    const { port, token } = this.current
    if (port && token) {
      try {
        await fetch(`http://127.0.0.1:${port}/api/system/shutdown`, {
          method: 'POST',
          headers: { 'X-ADou-Token': token },
          signal: AbortSignal.timeout(1500)
        })
      } catch {
        // 引擎可能已经退出，继续等待进程结束
      }
    }

    if (!(await waitForExit(child, 2500))) {
      child.kill()
      await waitForExit(child, 1500)
    }
    this.emit({ status: 'stopped', port: null, token: null })
  }

  private async terminate(): Promise<void> {
    const child = this.child
    this.child = null
    if (!child) {
      return
    }
    child.kill()
    await waitForExit(child, 1500)
  }

  private async waitForHealth(port: number, token: string): Promise<void> {
    const deadline = Date.now() + START_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (!this.child) {
        throw new Error('本地引擎进程已退出，请查看日志')
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
          headers: { 'X-ADou-Token': token },
          signal: AbortSignal.timeout(1200)
        })
        if (response.ok) {
          this.appendLog(`健康检查通过：${await response.text()}\n`)
          return
        }
      } catch {
        // 引擎尚未就绪，继续轮询
      }
      await delay(300)
    }
    const tail = this.recentLog.slice(-6).join('\n')
    throw new Error(`本地引擎启动超时。${tail ? '最近日志：' + tail : '请查看日志：' + this.logPath}`)
  }

  private resolveJava(): string {
    const exe = process.platform === 'win32' ? 'java.exe' : 'java'
    const candidates: string[] = []
    if (process.env.ADOU_JAVA_HOME) {
      candidates.push(join(process.env.ADOU_JAVA_HOME, 'bin', exe))
    }
    if (app.isPackaged) {
      candidates.push(join(process.resourcesPath, 'jre', 'bin', exe))
    } else {
      candidates.push(resolve(app.getAppPath(), '..', '.tools', 'jdk-25', 'bin', exe))
    }
    if (process.env.JAVA_HOME) {
      candidates.push(join(process.env.JAVA_HOME, 'bin', exe))
    }
    return candidates.find((candidate) => existsSync(candidate)) ?? exe
  }

  private resolveJar(): string {
    const candidate = app.isPackaged
      ? join(process.resourcesPath, 'backend', 'adou-ofd-backend.jar')
      : resolve(app.getAppPath(), '..', 'backend', 'target', 'adou-ofd-backend.jar')
    if (!existsSync(candidate)) {
      throw new Error(`未找到本地引擎：${candidate}。请先在项目根目录运行 npm run backend:build`)
    }
    return candidate
  }

  private emit(info: BackendInfo): void {
    this.current = info
    const payload = this.info
    for (const listener of this.listeners) {
      listener(payload)
    }
  }

  private appendLog(text: string): void {
    try {
      appendFileSync(this.logPath, text, 'utf8')
    } catch {
      // 日志失败不应影响引擎运行
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed) {
        this.recentLog.push(trimmed)
      }
    }
    if (this.recentLog.length > 120) {
      this.recentLog.splice(0, this.recentLog.length - 120)
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolvePort(port))
    })
  })
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null) {
    return Promise.resolve(true)
  }
  return new Promise((resolveExit) => {
    let settled = false
    const finish = (exited: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.removeListener('exit', onExit)
      resolveExit(exited)
    }
    const onExit = (): void => finish(true)
    const timer = setTimeout(() => finish(false), timeoutMs)
    child.on('exit', onExit)
  })
}
