import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { EditorState, type Extension } from "@codemirror/state"
import { EditorView, lineNumbers } from "@codemirror/view"
import { useEffect, useMemo, useRef } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { fillHeightTheme, isJson, languageSupport, readonlyTheme } from "./codemirror-shared.ts"

interface CodeMirrorReadonlyProps {
  readonly value: string
  readonly className?: string
  readonly wrapLines?: boolean
  readonly onReady?: () => void
  readonly language?: string | undefined
  readonly fillHeight?: boolean
}

function buildState(
  doc: string,
  isJsonContent: boolean,
  wrapLines: boolean,
  language: string | undefined,
  fillHeight: boolean,
) {
  const extensions: Extension[] = [
    readonlyTheme,
    lineNumbers(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
  ]

  if (fillHeight) {
    extensions.push(fillHeightTheme)
  }

  if (wrapLines) {
    extensions.push(EditorView.lineWrapping)
  }

  const parser = languageSupport(language, isJsonContent)
  if (parser) {
    extensions.push(parser)
  }

  return EditorState.create({ doc, extensions })
}

export function CodeMirrorReadonly({
  value,
  className,
  wrapLines = true,
  onReady,
  language,
  fillHeight = false,
}: CodeMirrorReadonlyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const initialValueRef = useRef(value)
  const isJsonContent = useMemo(() => isJson(value), [value])

  useMountEffect(() => {
    const container = containerRef.current
    if (!container) return

    const view = new EditorView({
      state: buildState(initialValueRef.current, isJsonContent, wrapLines, language, fillHeight),
      parent: container,
    })
    viewRef.current = view
    onReady?.()

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
      view.setState(buildState(value, isJsonContent, wrapLines, language, fillHeight))
    }
  }, [value, isJsonContent, wrapLines, language, fillHeight])

  return (
    <div
      ref={containerRef}
      className={cn("rounded-md overflow-hidden bg-muted", { "h-full": fillHeight }, className)}
    />
  )
}
