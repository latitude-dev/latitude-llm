import type { NumericRollup } from "@domain/spans"
import { Button, Text } from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import { useCallback, useState } from "react"

const KINDS = ["min", "max", "avg", "median", "sum"] as const

const KIND_LABELS: Record<(typeof KINDS)[number], string> = {
  min: "MIN",
  max: "MAX",
  avg: "AVG",
  median: "MED",
  sum: "SUM",
}

export type TableMetricFormat = "duration" | "price" | "count"

function formatMetricValue(value: number, format: TableMetricFormat): string {
  switch (format) {
    case "duration":
      return formatDuration(value)
    case "price":
      return formatPrice(value / 100_000_000)
    case "count":
      return formatCount(value)
  }
}

export function TableMetricSubheader({
  rollup,
  format,
  defaultKind = "avg",
  isLoading,
}: {
  rollup: NumericRollup | null | undefined
  format: TableMetricFormat
  defaultKind?: (typeof KINDS)[number]
  isLoading?: boolean
}) {
  const [kindIndex, setKindIndex] = useState(KINDS.indexOf(defaultKind))

  const bump = useCallback((delta: number) => {
    setKindIndex((i) => (i + delta + KINDS.length) % KINDS.length)
  }, [])

  const kind = KINDS[kindIndex % KINDS.length]

  if (isLoading) {
    return (
      <Text.H6 color="foregroundMuted" className="px-1 tabular-nums truncate">
        …
      </Text.H6>
    )
  }

  if (!rollup) {
    return (
      <Text.H6 color="foregroundMuted" className="px-1 truncate">
        —
      </Text.H6>
    )
  }

  const raw = rollup[kind]

  return (
    <div className="flex min-w-0 w-full items-center justify-end gap-0.5">
      <Button
        variant="ghost"
        className="min-h-0 h-auto w-auto px-0 py-0"
        onClick={(e) => {
          e.stopPropagation()
          bump(1)
        }}
      >
        <span className="flex min-w-0 items-center justify-end gap-0.5">
          <span className="shrink-0 text-xs leading-4 font-medium text-muted-foreground tabular-nums">
            {KIND_LABELS[kind]}
          </span>
          <span className="shrink-0 text-xs leading-4 font-semibold text-foreground">
            {formatMetricValue(raw, format)}
          </span>
        </span>
      </Button>
    </div>
  )
}
