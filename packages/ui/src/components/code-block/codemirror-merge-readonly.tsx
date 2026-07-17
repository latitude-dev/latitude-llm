import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { unifiedMergeView } from "@codemirror/merge"
import { EditorState, type Extension } from "@codemirror/state"
import { EditorView, lineNumbers } from "@codemirror/view"
import { useEffect, useRef } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { fillHeightTheme, isJson, languageSupport, readonlyTheme } from "./codemirror-shared.ts"

interface CodeMirrorMergeReadonlyProps {
  readonly before: string
  readonly after: string
  readonly className?: string
  readonly language?: string | undefined
  readonly fillHeight?: boolean
}

// Recolor @codemirror/merge's chunk classes to the app's semantic tokens so the
// diff tracks light/dark; the package's base theme ships fixed light-mode colors.
const mergeTheme = EditorView.theme({
  ".cm-changedLine": { backgroundColor: "hsl(var(--success-muted))" },
  ".cm-changedText": { backgroundColor: "hsl(var(--success) / 0.28)", backgroundImage: "none" },
  ".cm-deletedChunk": { backgroundColor: "hsl(var(--destructive-muted))" },
  ".cm-deletedChunk .cm-deletedText": {
    backgroundColor: "hsl(var(--destructive) / 0.28)",
    color: "hsl(var(--foreground))",
  },
  ".cm-changedLineGutter, .cm-deletedLineGutter": { backgroundColor: "transparent" },
})

function buildState(before: string, after: string, language: string | undefined, fillHeight: boolean) {
  const isJsonContent = isJson(after) || isJson(before)
  const extensions: Extension[] = [
    readonlyTheme,
    lineNumbers(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    unifiedMergeView({ original: before, mergeControls: false, gutter: false, syntaxHighlightDeletions: true }),
    mergeTheme,
    EditorView.lineWrapping,
  ]

  if (fillHeight) {
    extensions.push(fillHeightTheme)
  }

  const parser = languageSupport(language, isJsonContent)
  if (parser) {
    extensions.push(parser)
  }

  return EditorState.create({ doc: after, extensions })
}

export function CodeMirrorMergeReadonly({
  before,
  after,
  className,
  language,
  fillHeight = false,
}: CodeMirrorMergeReadonlyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const initialRef = useRef({ before, after })

  useMountEffect(() => {
    const container = containerRef.current
    if (!container) return

    const view = new EditorView({
      state: buildState(initialRef.current.before, initialRef.current.after, language, fillHeight),
      parent: container,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  })

  // TODO(frontend-use-effect-policy): CodeMirror is imperative; rebuild the state
  // when either side changes (the merge view has no reconfigure-in-place path).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.setState(buildState(before, after, language, fillHeight))
  }, [before, after, language, fillHeight])

  return (
    <div
      ref={containerRef}
      className={cn("rounded-md overflow-hidden bg-muted", { "h-full": fillHeight }, className)}
    />
  )
}
