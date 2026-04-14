interface NumberRangeFilterProps {
  readonly minValue: number | undefined
  readonly maxValue: number | undefined
  readonly onMinChange: (v: number | undefined) => void
  readonly onMaxChange: (v: number | undefined) => void
  readonly disabled?: boolean
}

export function NumberRangeFilter({ minValue, maxValue, onMinChange, onMaxChange, disabled }: NumberRangeFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        placeholder="Min"
        value={minValue ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Number(e.target.value)
          onMinChange(n !== undefined && !Number.isNaN(n) ? n : undefined)
        }}
        className="flex h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <input
        type="number"
        min={0}
        placeholder="Max"
        value={maxValue ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Number(e.target.value)
          onMaxChange(n !== undefined && !Number.isNaN(n) ? n : undefined)
        }}
        className="flex h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}
