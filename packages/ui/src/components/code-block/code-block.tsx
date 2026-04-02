import { lazy, Suspense, useMemo, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { CopyButton } from "../copy-button/index.tsx"

export interface CodeBlockProps {
  readonly value: string
  readonly copyable?: boolean
  readonly className?: string
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

export function CodeBlock({ value, copyable, className }: CodeBlockProps) {
  const [mounted, setMounted] = useState(false)
  const remountKey = useMemo(() => {
    let h = 0
    for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0
    return String(h)
  }, [value])

  useMountEffect(() => {
    setMounted(true)
  })

  if (!mounted) {
    return <CodeBlockFallback {...(className != null && { className })} />
  }

  return (
    <div className="relative">
      <Suspense fallback={<CodeBlockFallback {...(className != null && { className })} />}>
        <CodeMirrorReadonly key={remountKey} value={value} {...(className != null && { className })} />
      </Suspense>
      {copyable && (
        <div className="absolute top-1 right-1">
          <CopyButton value={value} tooltip="Copy" />
        </div>
      )}
    </div>
  )
}
