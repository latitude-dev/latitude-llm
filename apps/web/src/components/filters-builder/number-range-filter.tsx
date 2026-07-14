import { Button } from "@repo/ui"
import { XIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useDebounce } from "../../lib/hooks/useDebounce.ts"

interface NumberRangeFilterProps {
  readonly minValue: number | undefined
  readonly maxValue: number | undefined
  readonly onMinChange: (v: number | undefined) => void
  readonly onMaxChange: (v: number | undefined) => void
  readonly minPlaceholder?: string
  readonly maxPlaceholder?: string
  /** HTML `step` for both inputs; defaults to integer step when omitted. */
  readonly step?: number
}

/** Debounced min/max numeric inputs emitting `gte`/`lte` values (via the parent). */
export function NumberRangeFilter({
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  minPlaceholder = "Min",
  maxPlaceholder = "Max",
  step,
}: NumberRangeFilterProps) {
  const [localMin, setLocalMin] = useState(minValue?.toString() ?? "")
  const [localMax, setLocalMax] = useState(maxValue?.toString() ?? "")
  const [pendingMin, setPendingMin] = useState<number | undefined | null>(null)
  const [pendingMax, setPendingMax] = useState<number | undefined | null>(null)

  useDebounce(
    () => {
      if (pendingMin === null) return
      onMinChange(pendingMin)
    },
    400,
    [pendingMin, onMinChange],
  )

  useDebounce(
    () => {
      if (pendingMax === null) return
      onMaxChange(pendingMax)
    },
    400,
    [pendingMax, onMaxChange],
  )

  // TODO(frontend-use-effect-policy): keep local range inputs in sync with externally-controlled filter updates.
  useEffect(() => {
    setLocalMin(minValue?.toString() ?? "")
    setPendingMin(null)
  }, [minValue])
  // TODO(frontend-use-effect-policy): keep local range inputs in sync with externally-controlled filter updates.
  useEffect(() => {
    setLocalMax(maxValue?.toString() ?? "")
    setPendingMax(null)
  }, [maxValue])

  const hasValue = minValue !== undefined || maxValue !== undefined

  const handleClear = useCallback(() => {
    setLocalMin("")
    setLocalMax("")
    setPendingMin(undefined)
    setPendingMax(undefined)
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
          setLocalMin(e.target.value)
          const n = e.target.value === "" ? undefined : Number(e.target.value)
          setPendingMin(n !== undefined && !Number.isNaN(n) ? n : undefined)
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
          setLocalMax(e.target.value)
          const n = e.target.value === "" ? undefined : Number(e.target.value)
          setPendingMax(n !== undefined && !Number.isNaN(n) ? n : undefined)
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
