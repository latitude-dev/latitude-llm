import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { json } from "@codemirror/lang-json"
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import { useEffect, useMemo, useRef } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
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
    color: "hsl(var(--secondary-foreground))",
    backgroundColor: "hsl(var(--secondary))",
  },
  ".cm-content": {
    padding: "8px 0",
    caretColor: "hsl(var(--secondary-foreground))",
    backgroundColor: "hsl(var(--secondary))",
  },
  ".cm-gutters": {
    backgroundColor: "hsl(var(--secondary))",
    borderRight: "1px solid hsl(var(--secondary))",
    color: "hsl(var(--muted-foreground))",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    overflow: "auto",
    backgroundColor: "hsl(var(--secondary))",
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
  const isJsonContent = useMemo(() => isJson(value), [value])

  useMountEffect(() => {
    const container = containerRef.current
    if (!container) return

    const view = new EditorView({
      state: buildState({
        doc: initialValueRef.current,
        isJsonContent,
        readOnly,
        onChangeRef,
      }),
      parent: container,
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  })

  // TODO(frontend-use-effect-policy): CodeMirror is an imperative widget; parent-driven doc/readOnly updates must run after commit via the view API (not derivable in render).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentDoc = view.state.doc.toString()
    const isReadOnly = view.state.facet(EditorState.readOnly)
    if (currentDoc !== value || isReadOnly !== readOnly) {
      view.setState(buildState({ doc: value, isJsonContent, readOnly, onChangeRef }))
    }
  }, [value, isJsonContent, readOnly])

  return (
    <div
      ref={containerRef}
      className={cn("rounded-md border bg-secondary overflow-hidden", className)}
      style={minHeight ? { ["--cm-min-h" as string]: minHeight } : undefined}
    />
  )
}
