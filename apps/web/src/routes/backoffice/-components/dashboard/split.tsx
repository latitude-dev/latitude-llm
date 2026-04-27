import type { ReactNode } from "react"

/**
 * Two-column responsive layout for dashboard panels.
 *
 * The breakpoint is `md` (≥768 px) — below that the panels stack
 * full-width. Above, the columns split using the `ratio` prop. Pure
 * CSS, no JS.
 *
 * Why a custom helper instead of inline tailwind: the math on flex
 * basis values (`60%`, `40%`) is awkward to read at the call site,
 * and four-five flex classes per layout muddies the page component.
 */
export interface DashboardSplitProps {
  readonly primary: ReactNode
  readonly secondary: ReactNode
  /**
   * Ratio between the two panels on `md+` screens. Defaults to 50/50.
   * `wide-primary` makes the primary panel ~60% (the org page uses
   * this — the members list is denser than the projects list).
   */
  readonly ratio?: "even" | "wide-primary"
}

export function DashboardSplit({ primary, secondary, ratio = "even" }: DashboardSplitProps) {
  const primaryClasses =
    ratio === "wide-primary" ? "md:basis-[60%] md:grow-0 md:shrink" : "md:basis-1/2 md:grow md:shrink"
  const secondaryClasses =
    ratio === "wide-primary" ? "md:basis-[40%] md:grow-0 md:shrink" : "md:basis-1/2 md:grow md:shrink"

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-4">
      <div className={`flex min-w-0 flex-col ${primaryClasses}`}>{primary}</div>
      <div className={`flex min-w-0 flex-col ${secondaryClasses}`}>{secondary}</div>
    </div>
  )
}
