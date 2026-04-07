import type { NumericRollup } from "@domain/spans"
import { Button, Text } from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import { useCallback, useState } from "react"

const KINDS = ["min", "max", "avg", "median", "sum"] as const

const KIND_LABELS: Record<(typeof KINDS)[number], string> = {
  min: "MIN",
  max: "MAX",
  avg: "AVG",
  median: "MEDIAN",
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
      <Text.H6 color="foregroundMuted" className="tabular-nums truncate">
        …
      </Text.H6>
    )
  }

  if (!rollup) {
    return (
      <Text.H6 color="foregroundMuted" className="truncate">
        —
      </Text.H6>
    )
  }

  const raw = rollup[kind]

  return (
    <div className="flex min-w-0 w-full items-center justify-end gap-0.5">
      <Button
        variant="ghost"
        className="py-0"
        onClick={(e) => {
          e.stopPropagation()
          bump(1)
        }}
      >
        <Text.H6 color="foregroundMuted" className="min-w-0 flex-1 truncate text-center tabular-nums">
          {KIND_LABELS[kind]}
        </Text.H6>
        <Text.H6B color="foreground">{formatMetricValue(raw, format)}</Text.H6B>
      </Button>
    </div>
  )
}
