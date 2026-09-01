import type { ReactNode } from "react"

/**
 * The compact pick-one chip the setup surfaces use: the provider row of the manual
 * telemetry instructions and the import wizard's source step.
 */
export function SelectorChip({
  selected,
  onSelect,
  icon,
  label,
}: {
  readonly selected: boolean
  readonly onSelect: () => void
  readonly icon?: ReactNode
  readonly label: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors ${selected ? "border-primary/30 bg-primary-muted text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
