import type { ReactNode } from "react"
import { cn } from "../../../utils/cn.ts"

/**
 * Shared shell for code-like content in assistant messages — used by both
 * `JsonContent` (whole-part JSON) and the `pre` override in `MarkdownContent`
 * (Markdown code fences). Keeping the wrapper here is what makes the two
 * visually identical.
 *
 * `not-prose` opts the block out of Tailwind Typography so the look is the
 * same whether the shell renders inside a `prose` wrapper or standalone.
 */
export function CodeBlockShell({
  children,
  contentType,
  className,
}: {
  readonly children: ReactNode
  readonly contentType?: string | undefined
  readonly className?: string | undefined
}) {
  return (
    <pre
      {...(contentType ? { "data-content-type": contentType } : {})}
      className={cn(
        "not-prose min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs",
        className,
      )}
    >
      {children}
    </pre>
  )
}
