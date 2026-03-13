import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { json } from "@codemirror/lang-json"
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import { useEffect, useRef } from "react"
import { cn } from "../../utils/cn.ts"
import type { RichTextEditorProps } from "./rich-text-editor.tsx"

function isJson(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

const baseTheme = EditorView.theme({
  "&": {
    fontSize: "13px",
    fontFamily: "var(--font-mono)",
  },
  ".cm-content": {
    padding: "8px 0",
  },
  ".cm-gutters": {
    backgroundColor: "hsl(var(--muted) / 0.5)",
    borderRight: "1px solid hsl(var(--border))",
    color: "hsl(var(--muted-foreground))",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "hsl(var(--muted) / 0.8)",
  },
  ".cm-activeLine": {
    backgroundColor: "hsl(var(--accent) / 0.5)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
})

function buildState({
  doc,
  isJsonContent,
  readOnly,
  onChangeRef,
}: {
  doc: string
  isJsonContent: boolean
  readOnly: boolean
  onChangeRef: React.RefObject<((value: string) => void) | undefined>
}) {
  const extensions = [
    baseTheme,
    lineNumbers(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    syntaxHighlighting(defaultHighlightStyle),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current?.(update.state.doc.toString())
      }
    }),
  ]

  if (isJsonContent) {
    extensions.push(json())
  }

  if (readOnly) {
    extensions.push(EditorState.readOnly.of(true))
  }

  return EditorState.create({ doc, extensions })
}

export function CodeMirrorEditor({ value, onChange, readOnly = false, className, minHeight }: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const initialValueRef = useRef(value)
  const isJsonContent = useRef(isJson(value)).current

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const view = new EditorView({
      state: buildState({ doc: initialValueRef.current, isJsonContent, readOnly, onChangeRef }),
      parent: container,
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [isJsonContent, readOnly])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentDoc = view.state.doc.toString()
    if (currentDoc !== value) {
      view.setState(buildState({ doc: value, isJsonContent, readOnly, onChangeRef }))
    }
  }, [value, isJsonContent, readOnly])

  return (
    <div
      ref={containerRef}
      className={cn("rounded-md border bg-background overflow-hidden", className)}
      style={minHeight ? { ["--cm-min-h" as string]: minHeight } : undefined}
    />
  )
}
