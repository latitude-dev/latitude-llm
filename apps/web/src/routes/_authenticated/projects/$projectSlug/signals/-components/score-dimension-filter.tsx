import { SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import {
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
} from "@repo/ui"
import { CheckIcon, ChevronDownIcon, GaugeIcon } from "lucide-react"
import { useMemo } from "react"
import { SIGNAL_SCORE_DIMENSION_LABELS } from "../../../../../../components/signals/signal-score-dimensions.tsx"

export function parseSignalScoreDimensions(raw: string): readonly ScoreDimension[] {
  const selected = new Set(raw.split(","))
  return SCORE_DIMENSIONS.filter((dimension) => selected.has(dimension))
}

export function serializeSignalScoreDimensions(dimensions: readonly ScoreDimension[]): string {
  const selected = new Set(dimensions)
  return SCORE_DIMENSIONS.filter((dimension) => selected.has(dimension)).join(",")
}

export function ScoreDimensionFilter({
  value,
  onChange,
}: {
  readonly value: readonly ScoreDimension[]
  readonly onChange: (next: readonly ScoreDimension[]) => void
}) {
  const selected = useMemo(() => new Set(value), [value])
  const onlySelectedDimension = SCORE_DIMENSIONS.find((dimension) => selected.has(dimension))
  const triggerLabel =
    selected.size === 0
      ? "Dimension"
      : selected.size === 1 && onlySelectedDimension
        ? SIGNAL_SCORE_DIMENSION_LABELS[onlySelectedDimension]
        : `${selected.size} dimensions`

  const toggle = (dimension: ScoreDimension) => {
    const next = new Set(selected)
    if (next.has(dimension)) next.delete(dimension)
    else next.add(dimension)
    onChange(SCORE_DIMENSIONS.filter((candidate) => next.has(candidate)))
  }

  return (
    <DropdownMenuRoot>
      <DropdownMenuTrigger asChild>
        <Button variant={selected.size > 0 ? "secondary" : "outline"}>
          <Icon icon={GaugeIcon} size="sm" />
          {triggerLabel}
          <Icon icon={ChevronDownIcon} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Filter by score dimension</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SCORE_DIMENSIONS.map((dimension) => (
          <DropdownMenuItem
            key={dimension}
            role="menuitemcheckbox"
            aria-checked={selected.has(dimension)}
            onSelect={(event) => {
              event.preventDefault()
              toggle(dimension)
            }}
            className="cursor-pointer gap-2"
          >
            <span className="flex-1">{SIGNAL_SCORE_DIMENSION_LABELS[dimension]}</span>
            {selected.has(dimension) ? <Icon icon={CheckIcon} size="sm" /> : null}
          </DropdownMenuItem>
        ))}
        {selected.size > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])} className="cursor-pointer justify-center">
              Clear filter
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenuRoot>
  )
}
