import { useEffect, useRef, useState } from 'react'
import { IconAlert, IconClose } from './icons'

interface PasswordDialogProps {
  open: boolean
  fileName: string
  message: string
  invalid: boolean
  busy: boolean
  onSubmit: (password: string) => void
  onCancel: () => void
}

export function PasswordDialog({
  open,
  fileName,
  message,
  invalid,
  busy,
  onSubmit,
  onCancel
}: PasswordDialogProps) {
  const [password, setPassword] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setPassword('')
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open, fileName])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, busy, onCancel])

  if (!open) return null

  const submit = (): void => {
    if (busy || password.length === 0) return
    onSubmit(password)
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <div
        className="password-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-title"
      >
        <header className="password-head">
          <h2 id="password-title">PDF 已加密</h2>
          <button
            type="button"
            className="about-close"
            data-password="cancel"
            onClick={onCancel}
            disabled={busy}
            aria-label="取消打开"
          >
            <IconClose size={16} />
          </button>
        </header>
        <div className="password-body">
          <p className="password-file" title={fileName}>
            {fileName}
          </p>
          <label className="password-field">
            <span>打开密码</span>
            <input
              ref={inputRef}
              data-password="input"
              type="password"
              value={password}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
              }}
            />
          </label>
          <p className={`password-message${invalid ? ' is-error' : ''}`}>
            {invalid ? <IconAlert size={13} /> : null}
            {message}
          </p>
          <p className="password-note">密码仅用于本次打开，不会保存或写入日志。</p>
        </div>
        <footer className="password-actions">
          <button
            type="button"
            className="btn ghost"
            data-password="cancel-button"
            onClick={onCancel}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            data-password="submit"
            onClick={submit}
            disabled={busy || password.length === 0}
          >
            {busy ? <span className="btn-spinner" /> : null}
            {busy ? '正在打开…' : '打开'}
          </button>
        </footer>
      </div>
    </div>
  )
}
