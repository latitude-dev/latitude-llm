import { lazy, Suspense, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"

export interface RichTextEditorProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  className?: string
  minHeight?: string
}

const CodeMirrorEditor = lazy(() => import("./codemirror-editor.tsx").then((m) => ({ default: m.CodeMirrorEditor })))

function EditorFallback({ minHeight }: { minHeight: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border bg-muted/50 text-muted-foreground text-sm"
      style={{ minHeight }}
    >
      Loading editor…
    </div>
  )
}

const DEFAULT_MIN_HEIGHT = "120px"

export function RichTextEditor(props: RichTextEditorProps) {
  const [mounted, setMounted] = useState(false)
  const height = props.minHeight ?? DEFAULT_MIN_HEIGHT

  useMountEffect(() => {
    setMounted(true)
  })

  if (!mounted) {
    return <EditorFallback minHeight={height} />
  }

  return (
    <Suspense fallback={<EditorFallback minHeight={height} />}>
      <CodeMirrorEditor {...props} />
    </Suspense>
  )
}
