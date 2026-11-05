import type { ThemePreference, ResolvedTheme } from '@shared/types'

const STORAGE_KEY = 'adou.theme'
const SYSTEM_QUERY = '(prefers-color-scheme: dark)'

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // 本地存储不可用时仅保持当前会话状态
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(SYSTEM_QUERY).matches ? 'dark' : 'light'
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export function applyThemePreference(preference: ThemePreference): ResolvedTheme {
  const theme = resolveTheme(preference)
  applyResolvedTheme(theme)
  return theme
}

export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  const media = window.matchMedia(SYSTEM_QUERY)
  const listener = (): void => onChange(media.matches ? 'dark' : 'light')
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
