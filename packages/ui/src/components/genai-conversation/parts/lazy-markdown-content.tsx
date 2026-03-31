import { lazy, Suspense } from "react"
import { Skeleton } from "../../skeleton/skeleton.tsx"

const MarkdownContentLazy = lazy(() => import("./markdown-content.tsx").then((m) => ({ default: m.MarkdownContent })))

function MarkdownFallback() {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  )
}

export function MarkdownContent({
  content,
  messageIndex,
  partIndex,
}: {
  readonly content: string
  readonly messageIndex?: number | undefined
  readonly partIndex?: number | undefined
}) {
  return (
    <Suspense fallback={<MarkdownFallback />}>
      <MarkdownContentLazy content={content} messageIndex={messageIndex} partIndex={partIndex} />
    </Suspense>
  )
}
