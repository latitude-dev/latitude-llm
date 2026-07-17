import { lazy, Suspense, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"

export interface CodeDiffProps {
  readonly before: string
  readonly after: string
  readonly language?: string
  readonly className?: string
  /** Fill a height-bounded parent and scroll inside the block instead of growing to fit content. */
  readonly fillHeight?: boolean
}

const CodeDiffView = lazy(() => import("./code-diff-view.tsx").then((m) => ({ default: m.CodeDiffView })))

function CodeDiffFallback({ className }: { readonly className?: string }) {
  return (
    <div className={cn("flex items-center rounded-md bg-muted p-3 text-xs text-muted-foreground", className)}>
      Loading…
    </div>
  )
}

/** Read-only, GitHub-style unified diff of two text bodies, syntax-highlighted per line. */
export function CodeDiff({ before, after, language, className, fillHeight = false }: CodeDiffProps) {
  const [mounted, setMounted] = useState(false)

  useMountEffect(() => {
    setMounted(true)
  })

  if (!mounted) {
    return <CodeDiffFallback {...(className != null && { className })} />
  }

  return (
    <Suspense fallback={<CodeDiffFallback {...(className != null && { className })} />}>
      <CodeDiffView
        before={before}
        after={after}
        fillHeight={fillHeight}
        {...(language != null && { language })}
        {...(className != null && { className })}
      />
    </Suspense>
  )
}
