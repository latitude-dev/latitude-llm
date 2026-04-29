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
 *
 * `controls` overlays absolutely-positioned UI (typically a `<CodeBlockControls />`)
 * on the top-right of the block. When set, the `<pre>` is wrapped in a
 * `relative` container so the controls anchor correctly.
 */
export function CodeBlockShell({
  children,
  contentType,
  className,
  controls,
}: {
  readonly children: ReactNode
  readonly contentType?: string | undefined
  readonly className?: string | undefined
  readonly controls?: ReactNode | undefined
}) {
  const pre = (
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

  if (!controls) return pre

  return (
    <div className="relative">
      {pre}
      {controls}
    </div>
  )
}
