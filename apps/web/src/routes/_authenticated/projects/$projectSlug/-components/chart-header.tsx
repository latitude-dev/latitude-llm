import { Icon, Text, type TextColor, Tooltip } from "@repo/ui"
import { formatChartWindowCaption } from "@repo/utils"
import { ClockIcon, InfoIcon } from "lucide-react"
import type { ReactNode } from "react"

interface ChartHeaderProps {
  /** Chart title, e.g. "Tool calls over time". Omit when a sibling control (e.g. a metric selector) already labels the chart. */
  readonly title?: string
  readonly fromIso: string
  readonly toIso: string
  /** The All-time default charts a bounded, latest-activity-anchored slice — flag it so the copy explains the window. */
  readonly isAllTime: boolean
  /** Right-aligned controls (e.g. the Incidents overlay toggle). */
  readonly actions?: ReactNode
  /**
   * Whether to caption the rendered window. Pass `false` where a visible picker
   * already states the same range — repeating it on every panel is noise. Pages
   * whose chart range can differ from the picker must keep it.
   */
  readonly showWindow?: boolean
  readonly titleColor?: TextColor
}

/**
 * Header shown above a time-series chart: an optional title plus the rendered time window. Under the
 * All-time default the chart is a recent, latest-activity-anchored slice while the totals/list cover
 * the full range — the subtitle + tooltip make that explicit so the window isn't read as "all time".
 *
 * `min-h-11` is the row's own `pt-3` (12px) plus the tallest control ever passed as `actions` (a
 * `size="sm"` bordered `Tabs` switch, `h-8`/32px) — 44px total. The padding lives inside this same
 * box, so the floor has to cover it too: a bare `min-h-8` would only match the switch on its own
 * and never bind on the row that already grows past it, leaving a shorter row's `min-height` cap
 * with nothing forcing it up to the same total.
 */
export function ChartHeader({
  title,
  fromIso,
  toIso,
  isAllTime,
  actions,
  showWindow = true,
  titleColor = "foreground",
}: ChartHeaderProps) {
  const window = showWindow ? formatChartWindowCaption(fromIso, toIso) : ""
  if (!window && !title && !actions) return null

  return (
    <div className="flex min-h-11 items-start justify-between gap-2 px-4 pt-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        {title ? <Text.H6 color={titleColor}>{title}</Text.H6> : null}
        {window ? (
          <div className="flex items-center gap-1">
            <Icon icon={ClockIcon} size="sm" color="foregroundMuted" />
            <Text.H6 color="foregroundMuted">{isAllTime ? `Recent activity · ${window}` : window}</Text.H6>
            {isAllTime ? (
              <Tooltip
                asChild
                trigger={
                  <span className="inline-flex cursor-default">
                    <Icon icon={InfoIcon} size="sm" color="foregroundMuted" />
                  </span>
                }
              >
                Chart shows recent activity anchored to your latest data. Totals and the list cover all time.
              </Tooltip>
            ) : null}
          </div>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  )
}
