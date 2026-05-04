import { json } from "@codemirror/lang-json"
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { EditorView, lineNumbers } from "@codemirror/view"
import { useEffect, useMemo, useRef } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"

interface CodeMirrorReadonlyProps {
  readonly value: string
  readonly className?: string
  readonly wrapLines?: boolean
}

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

const readonlyTheme = EditorView.theme({
  "&": {
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
  },
  ".cm-content": {
    padding: "8px 0",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid hsl(var(--border))",
    color: "hsl(var(--muted-foreground))",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-cursor, .cm-dropCursor": {
    display: "none !important",
  },
})

function buildState(doc: string, isJsonContent: boolean, wrapLines: boolean) {
  const extensions = [
    readonlyTheme,
    lineNumbers(),
    syntaxHighlighting(defaultHighlightStyle),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
  ]

  if (wrapLines) {
    extensions.push(EditorView.lineWrapping)
  }

  if (isJsonContent) {
    extensions.push(json())
  }

  return EditorState.create({ doc, extensions })
}

export function CodeMirrorReadonly({ value, className, wrapLines = true }: CodeMirrorReadonlyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const initialValueRef = useRef(value)
  const isJsonContent = useMemo(() => isJson(value), [value])

  useMountEffect(() => {
    const container = containerRef.current
    if (!container) return

    const view = new EditorView({
      state: buildState(initialValueRef.current, isJsonContent, wrapLines),
      parent: container,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  })

  // TODO(frontend-use-effect-policy): CodeMirror is imperative; this syncs the
  // parent-driven value prop into the editor state without remounting the widget.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() !== value) {
      view.setState(buildState(value, isJsonContent, wrapLines))
    }
  }, [value, isJsonContent, wrapLines])

  return <div ref={containerRef} className={cn("rounded-md overflow-hidden bg-muted", className)} />
}
