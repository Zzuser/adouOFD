import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder
} from '@codemirror/view'

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    fontSize: '13px'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, "Microsoft YaHei UI", monospace',
    lineHeight: '1.7'
  },
  '.cm-content': { padding: '18px 0 72px', caretColor: 'var(--brand-deep)' },
  '.cm-line': { padding: '0 20px' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--ink-faint)'
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 16px' },
  '.cm-activeLine': { backgroundColor: 'var(--surface-2)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--brand)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(228, 181, 75, 0.32)'
  },
  '.cm-cursor': { borderLeftColor: 'var(--brand-deep)' },
  '.cm-searchMatch': { backgroundColor: 'rgba(228, 181, 75, 0.3)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(228, 181, 75, 0.55)' },
  '.cm-panels': { backgroundColor: 'var(--surface-2)', color: 'var(--ink)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-textfield': { border: '1px solid var(--line)', borderRadius: '6px', padding: '3px 6px' },
  '.cm-button': {
    border: '1px solid var(--line)',
    borderRadius: '6px',
    background: 'var(--surface)',
    color: 'var(--ink)'
  }
})

const editorHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--code-keyword)' },
  { tag: [tags.atom, tags.bool, tags.number], color: 'var(--code-number)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--code-string)' },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: 'var(--code-comment)',
    fontStyle: 'italic'
  },
  {
    tag: [tags.definition(tags.variableName), tags.function(tags.variableName)],
    color: 'var(--code-function)'
  },
  { tag: [tags.typeName, tags.className], color: 'var(--code-type)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--code-property)' },
  { tag: [tags.heading, tags.strong], color: 'var(--code-heading)', fontWeight: '700' },
  { tag: [tags.link, tags.url], color: 'var(--code-link)', textDecoration: 'underline' },
  { tag: tags.meta, color: 'var(--code-comment)' },
  { tag: tags.invalid, color: 'var(--danger)' }
])

interface TextEditorProps {
  value: string
  markdown: boolean
  visible: boolean
  onChange: (value: string) => void
}

export interface TextEditorHandle {
  scrollToLine: (line: number) => void
}

export const TextEditor = forwardRef<TextEditorHandle, TextEditorProps>(function TextEditor(
  { value, markdown: markdownMode, visible, onChange },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(line: number) {
        const view = viewRef.current
        if (!view) return
        const target = Math.min(Math.max(1, line), view.state.doc.lines)
        const position = view.state.doc.line(target).from
        view.dispatch({
          selection: { anchor: position },
          effects: EditorView.scrollIntoView(position, { y: 'start' })
        })
        view.focus()
      }
    }),
    []
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      highlightSelectionMatches(),
      EditorState.allowMultipleSelections.of(true),
      EditorView.lineWrapping,
      editorTheme,
      syntaxHighlighting(editorHighlightStyle, { fallback: true }),
      keymap.of([
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString())
        }
      })
    ]
    if (markdownMode) extensions.push(markdown())
    extensions.push(placeholder(markdownMode ? '开始输入 Markdown…' : '开始输入文本…'))
    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: host
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
    }
    // 初始文档只读取一次；后续通过下方 effect 同步外部内容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdownMode])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  useEffect(() => {
    if (visible) viewRef.current?.requestMeasure()
  }, [visible])

  return <div className="text-editor" data-text-editor ref={hostRef} />
})
