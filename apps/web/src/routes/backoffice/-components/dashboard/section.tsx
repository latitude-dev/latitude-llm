import { Text } from "@repo/ui"
import type { ReactNode } from "react"

/**
 * A panel in a backoffice detail dashboard.
 *
 * Card-shaped (border + neutral bg), with a header strip (label +
 * optional count chip + optional right-aligned aside) and a body that
 * contains whatever the consumer renders. Used for the meaty
 * cross-entity sections (Members, Projects, Memberships, Activity,
 * Settings).
 *
 * The card wraps content; `DashboardHero` deliberately doesn't,
 * giving the dashboard its visual rhythm: one open identity zone at
 * the top, contained panels below.
 */
export interface DashboardSectionProps {
  readonly title: ReactNode
  /** Tiny pill rendered after the title — "(12)" → renders as the count chip. */
  readonly count?: number
  /** Right-aligned slot in the header — "Show all", "Refresh", etc. */
  readonly aside?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}

export function DashboardSection({ title, count, aside, children, className }: DashboardSectionProps) {
  return (
    <section className={["flex flex-col rounded-lg border border-border bg-background", className].filter(Boolean).join(" ")}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Text.H6 weight="semibold" noWrap>
            {title}
          </Text.H6>
          {count !== undefined && (
            <span className="rounded-full bg-muted px-1.5 text-xs leading-5 text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </div>
        {aside !== undefined && <div className="shrink-0">{aside}</div>}
      </header>
      <div className="flex flex-col p-4">{children}</div>
    </section>
  )
}
