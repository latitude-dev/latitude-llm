import { Icon } from "@repo/ui"
import { ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Presentational shell for a backoffice list row.
 *
 * Used both on the search results page and as the building block for
 * cross-entity sections on detail pages (e.g., a user's organisation
 * memberships, an organisation's projects). Knows nothing about
 * routing — the entity-specific row components (`UserRow`,
 * `OrganizationRow`, `ProjectRow`) wrap this in a `<Link>` (or `<a>`
 * pending route registration) and pass slots in.
 *
 * Visual contract:
 * - subtle border + neutral background, no shadow at rest
 * - on hover: faint bg shift + small upward lift + soft shadow + chevron
 *   fades in on the right edge as a navigation affordance
 * - left slot is a fixed-width visual identity column (avatar / icon /
 *   project emoji), middle slot is two-tier text content, right slot
 *   is metadata (date, badge, etc.). Chevron is always last.
 */
export interface RowProps {
  /** Visual identity element on the left edge — typically an `<Avatar>` or icon block. */
  readonly leading: ReactNode
  /** Primary line — usually the entity's display name / email. Wrap in `<Text.H5>` for consistent type. */
  readonly primary: ReactNode
  /** Inline badges rendered immediately after `primary` (admin badge, status pill, etc.). */
  readonly primaryBadges?: ReactNode
  /** Secondary line below `primary`. Usually the slug, id, or supporting metadata. */
  readonly secondary?: ReactNode
  /** Right-edge metadata — usually a relative date or a role badge. Optional; if omitted, the chevron sits closer to the content. */
  readonly trailing?: ReactNode
}

export function Row({ leading, primary, primaryBadges, secondary, trailing }: RowProps) {
  return (
    <div
      className={[
        "group flex items-center gap-4 rounded-md border border-border bg-background px-4 py-3",
        "transition-all duration-150",
        "hover:bg-muted/60 hover:shadow-sm hover:-translate-y-px",
      ].join(" ")}
    >
      <div className="shrink-0">{leading}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          {primary}
          {primaryBadges}
        </div>
        {secondary !== undefined && <div className="flex items-center gap-2 min-w-0">{secondary}</div>}
      </div>
      {trailing !== undefined && <div className="shrink-0">{trailing}</div>}
      <Icon
        icon={ChevronRightIcon}
        size="sm"
        color="foregroundMuted"
        className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      />
    </div>
  )
}
