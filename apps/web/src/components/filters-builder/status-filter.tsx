import { Button, Icon } from "@repo/ui"
import { CheckCircle2Icon, XCircleIcon } from "lucide-react"

const STATUS_PICKS = [
  { value: "ok", label: "OK", icon: CheckCircle2Icon },
  { value: "error", label: "Error", icon: XCircleIcon },
] as const

export type StatusFilterValue = (typeof STATUS_PICKS)[number]["value"]

interface StatusFilterProps {
  readonly selected: readonly StatusFilterValue[]
  readonly onChange: (next: readonly StatusFilterValue[]) => void
}

export function StatusFilter({ selected, onChange }: StatusFilterProps) {
  const toggle = (v: StatusFilterValue) => {
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v])
  }

  return (
    <div className="flex items-center gap-2">
      {STATUS_PICKS.map(({ value, label, icon }) => {
        const active = selected.includes(value)
        return (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={active ? "default-soft" : "outline"}
            onClick={() => toggle(value)}
            aria-pressed={active}
          >
            <Icon icon={icon} size="sm" />
            {label}
          </Button>
        )
      })}
    </div>
  )
}
