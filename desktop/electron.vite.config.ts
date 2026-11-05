import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * KaTeX 的 @font-face 同时引用 woff2/woff/ttf。Electron 的 Chromium 只会用 woff2，
 * 另外两种格式约 876KB，从产物中移除，避免白白增大安装包。
 */
const stripKatexLegacyFonts: Plugin = {
  name: 'strip-katex-legacy-fonts',
  apply: 'build',
  generateBundle(_options, bundle) {
    for (const fileName of Object.keys(bundle)) {
      if (/KaTeX_.*\.(?:woff|ttf)$/i.test(fileName)) {
        delete bundle[fileName]
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), stripKatexLegacyFonts]
  }
})
