import { Text } from "@repo/ui"
import type { ReactNode } from "react"

/**
 * Backoffice detail-page hero.
 *
 * Renders the top of every detail dashboard (user / project / org)
 * with a consistent shape: a large leading visual on the left,
 * stacked title + subtitle in the middle, and right-aligned action
 * buttons. Each detail page customises the slots — emoji block vs
 * avatar, what the inline subtitle aggregates, whether there are
 * primary actions — so the pages share a silhouette without becoming
 * identical.
 *
 * Deliberately not wrapped in a card. The rest of the dashboard uses
 * card-shaped panels (`DashboardSection`); leaving the hero "open"
 * gives the page visual hierarchy — this is the entity, those are its
 * facets.
 */
export interface DashboardHeroProps {
  /** Large visual identity element — avatar / emoji block / org icon. */
  readonly leading: ReactNode
  /** The entity's display name. Renders as a Text.H2-equivalent heading. */
  readonly title: ReactNode
  /**
   * Inline status / role pills rendered next to the title, before the
   * subtitle. Use for transient state ("deleted", "platform admin"),
   * not for stats — stats go in {@link meta}.
   */
  readonly badges?: ReactNode
  /**
   * Single-line subtitle. Pages typically aggregate this from multiple
   * facts joined with " · " (e.g. "/acme · 12 members · 4 projects ·
   * created 6 months ago"). Caller is responsible for the joining
   * because the right separators / linkable spans depend on context.
   */
  readonly meta?: ReactNode
  /** Right-aligned action buttons — primary admin actions like Impersonate. */
  readonly actions?: ReactNode
}

export function DashboardHero({ leading, title, badges, meta, actions }: DashboardHeroProps) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="flex min-w-0 items-start gap-4">
        <div className="shrink-0">{leading}</div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Text.H2 weight="semibold" ellipsis noWrap>
              {title}
            </Text.H2>
            {badges}
          </div>
          {meta !== undefined && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {meta}
            </div>
          )}
        </div>
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
