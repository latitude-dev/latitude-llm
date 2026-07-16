import type { MetricDeltaValue, MetricDirection, MetricEntity, MetricUnit } from "@domain/experiments"
import { cn, Icon, Text } from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  type LucideIcon,
  MessagesSquareIcon,
  ShieldAlertIcon,
  TagsIcon,
  UsersRoundIcon,
  WrenchIcon,
} from "lucide-react"

/** Icon per comparable entity, used on the collapsible metric-group headers. */
export const ENTITY_ICON: Record<MetricEntity, LucideIcon> = {
  sessions: MessagesSquareIcon,
  users: UsersRoundIcon,
  tools: WrenchIcon,
  signals: ShieldAlertIcon,
  behaviours: TagsIcon,
}

export const ENTITY_LABEL: Record<MetricEntity, string> = {
  sessions: "Sessions",
  users: "Users",
  tools: "Tools",
  signals: "Signals",
  behaviours: "Behaviours",
}

const NS_PER_SECOND = 1_000_000_000

/** Drop trailing-zero decimals while keeping any unit suffix: "220.0ms" -> "220ms", "0.0%" -> "0%". */
function stripTrailingZeros(formatted: string): string {
  return formatted.replace(/(\d+)\.(\d*?)0+(\D|$)/g, (_, whole, frac, tail) =>
    frac ? `${whole}.${frac}${tail}` : `${whole}${tail}`,
  )
}

function formatMetricUnit(value: number, unit: MetricUnit): string {
  switch (unit) {
    case "count":
      return formatCount(value)
    case "tokens":
      return formatCount(value)
    case "percent":
      return `${(value * 100).toFixed(1)}%`
    case "seconds":
      return formatDuration(value * NS_PER_SECOND)
    case "dollars":
      // Compact large amounts ($1.2K / $3.4M / $1.5B); small amounts keep adaptive precision.
      return value >= 1000 ? `$${formatCount(value)}` : formatPrice(value)
    case "score":
      return value.toFixed(2)
    case "days":
      return value.toFixed(1)
  }
}

/** Format a metric value in its display unit. `null` renders as an em dash. */
export function formatMetricValue(value: number | null, unit: MetricUnit): string {
  if (value === null || Number.isNaN(value)) return "—"
  return stripTrailingZeros(formatMetricUnit(value, unit))
}

/** Whether a signed change should read as good (green), bad (red), or neutral for a given direction. */
function deltaTone(change: number, direction: MetricDirection): "success" | "destructive" | "foregroundMuted" {
  if (direction === "neutral" || change === 0) return "foregroundMuted"
  const isGood = direction === "up-good" ? change > 0 : change < 0
  return isGood ? "success" : "destructive"
}

/** The signed % difference vs the baseline, with a direction arrow and success/destructive color. */
export function MetricDelta({
  change,
  direction,
  className,
}: {
  readonly change: MetricDeltaValue | null
  readonly direction: MetricDirection
  readonly className?: string
}) {
  if (change === null) return null
  // Baseline was 0 and the variant isn't: an unbounded increase, labelled "New" (tone by direction).
  if (change === "up-from-zero") {
    const tone = deltaTone(1, direction)
    return (
      <span className={cn("inline-flex items-center gap-0.5", className)}>
        <Icon icon={ArrowUpIcon} size="xs" color={tone} />
        <Text.H6 color={tone} noWrap>
          New
        </Text.H6>
      </span>
    )
  }
  // Sub-0.1% moves are noise (and cover an exact 0): render nothing.
  if (Math.abs(change) < 0.001) return null
  const tone = deltaTone(change, direction)
  const arrow = change > 0 ? ArrowUpIcon : change < 0 ? ArrowDownIcon : undefined
  const percent = change * 100
  // Localised so large deltas read as "+1,200.0%" rather than "+1200.0%".
  const pct = `${percent > 0 ? "+" : ""}${percent.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {arrow ? <Icon icon={arrow} size="xs" color={tone} /> : null}
      <Text.H6 color={tone} noWrap>
        {pct}
      </Text.H6>
    </span>
  )
}
