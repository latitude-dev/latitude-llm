import { lazy, Suspense, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { CodeBlockControls } from "./code-block-controls.tsx"

export interface CodeBlockProps {
  readonly value: string
  readonly copyable?: boolean
  readonly expandable?: boolean
  readonly language?: string
  readonly className?: string
  readonly wrapLines?: boolean
}

const CodeMirrorReadonly = lazy(() =>
  import("./codemirror-readonly.tsx").then((m) => ({ default: m.CodeMirrorReadonly })),
)

function CodeBlockFallback({ className }: { readonly className?: string }) {
  return (
    <div className={cn("flex items-center rounded-md bg-muted p-3 text-xs text-muted-foreground", className)}>
      Loading…
    </div>
  )
}

export function CodeBlock({
  value,
  copyable = true,
  expandable = true,
  language,
  className,
  wrapLines = true,
}: CodeBlockProps) {
  const [mounted, setMounted] = useState(false)

  useMountEffect(() => {
    setMounted(true)
  })

  if (!mounted) {
    return <CodeBlockFallback {...(className != null && { className })} />
  }

  return (
    <div className="group relative">
      <Suspense fallback={<CodeBlockFallback {...(className != null && { className })} />}>
        <CodeMirrorReadonly value={value} wrapLines={wrapLines} {...(className != null && { className })} />
      </Suspense>
      <CodeBlockControls
        content={value}
        copyable={copyable}
        expandable={expandable}
        {...(language != null && { language })}
      />
    </div>
  )
}
