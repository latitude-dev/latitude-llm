import { Button } from "@repo/ui"
import { XIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useDebouncedCommit } from "../../lib/hooks/useDebouncedCommit.ts"

interface NumberRangeFilterProps {
  readonly minValue: number | undefined
  readonly maxValue: number | undefined
  readonly onRangeChange: (min: number | undefined, max: number | undefined) => void
  readonly minPlaceholder?: string
  readonly maxPlaceholder?: string
  /** HTML `step` for both inputs; defaults to integer step when omitted. */
  readonly step?: number
}

interface PendingRange {
  readonly min: number | undefined
  readonly max: number | undefined
}

function parseInputValue(raw: string): number | undefined {
  if (raw === "") return undefined
  const parsed = Number(raw)
  return Number.isNaN(parsed) ? undefined : parsed
}

/** Debounced min/max numeric inputs emitting `gte`/`lte` values (via the parent). */
export function NumberRangeFilter({
  minValue,
  maxValue,
  onRangeChange,
  minPlaceholder = "Min",
  maxPlaceholder = "Max",
  step,
}: NumberRangeFilterProps) {
  const [localMin, setLocalMin] = useState(minValue?.toString() ?? "")
  const [localMax, setLocalMax] = useState(maxValue?.toString() ?? "")
  // One pending range, not a pending min plus a pending max: both bounds share a filter key, so two
  // independent commits landing in the same tick would each write the other's bound back to stale.
  const [pending, setPending] = useState<PendingRange | null>(null)

  const commitRange = useCallback((range: PendingRange) => onRangeChange(range.min, range.max), [onRangeChange])
  useDebouncedCommit(pending, commitRange, 400)

  // TODO(frontend-use-effect-policy): keep local range inputs in sync with externally-controlled filter updates.
  useEffect(() => {
    setLocalMin(minValue?.toString() ?? "")
    setLocalMax(maxValue?.toString() ?? "")
    setPending(null)
  }, [minValue, maxValue])

  const hasValue = minValue !== undefined || maxValue !== undefined

  const handleClear = useCallback(() => {
    setLocalMin("")
    setLocalMax("")
    setPending({ min: undefined, max: undefined })
  }, [])

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        step={step ?? 1}
        placeholder={minPlaceholder}
        value={localMin}
        onChange={(e) => {
          const raw = e.target.value
          setLocalMin(raw)
          setPending({ min: parseInputValue(raw), max: parseInputValue(localMax) })
        }}
        className="flex h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <input
        type="number"
        min={0}
        step={step ?? 1}
        placeholder={maxPlaceholder}
        value={localMax}
        onChange={(e) => {
          const raw = e.target.value
          setLocalMax(raw)
          setPending({ min: parseInputValue(localMin), max: parseInputValue(raw) })
        }}
        className="flex h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
      />
      {hasValue ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          className="h-7 w-7 shrink-0"
          aria-label="Clear filter"
          title="Clear filter"
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  )
}
