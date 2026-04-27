import { Text } from "@repo/ui"
import type { ReactNode } from "react"

/**
 * Label + value row used inside dashboard section panels.
 *
 * Replaces the old `<DetailRow>` pattern (a 2-column CSS grid that
 * wrapped a `<>` fragment of two `<Text>` nodes). Cleaner because:
 *
 * - It's a real component, not a fragment masquerading as one.
 * - Accepts a ReactNode value, so consumers can drop in links, badges,
 *   icons inline.
 * - No surrounding grid required — these stack vertically inside
 *   `DashboardSection` and can live in a flex column.
 *
 * For dense key-value blocks (the bottom "properties" strip), prefer
 * `PropertiesStrip` which renders things horizontally / muted instead
 * of as a stack.
 */
export interface FactRowProps {
  readonly label: ReactNode
  readonly value: ReactNode
}

export function FactRow({ label, value }: FactRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
      <Text.H6 color="foregroundMuted" noWrap>
        {label}
      </Text.H6>
      <div className="flex items-center justify-end min-w-0">
        {typeof value === "string" || typeof value === "number" ? (
          <Text.H6 ellipsis noWrap>
            {value}
          </Text.H6>
        ) : (
          value
        )}
      </div>
    </div>
  )
}
