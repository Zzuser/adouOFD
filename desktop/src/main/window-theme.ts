import { nativeTheme } from 'electron'

export const LIGHT_WINDOW_BACKGROUND = '#f6f4ec'
export const DARK_WINDOW_BACKGROUND = '#141916'

export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? DARK_WINDOW_BACKGROUND : LIGHT_WINDOW_BACKGROUND
}
