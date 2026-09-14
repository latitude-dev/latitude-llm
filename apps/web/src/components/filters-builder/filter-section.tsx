import { Button, Icon, Text } from "@repo/ui"
import { XIcon } from "lucide-react"
import type { ReactNode } from "react"

interface FilterSectionProps {
  readonly label: string
  readonly children: ReactNode
  readonly onRemove?: () => void
}

/** A labeled, removable wrapper around one filter control in the `FilterBuilder`. */
export function FilterSection({ label, children, onRemove }: FilterSectionProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted">{label}</Text.H6>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            onClick={onRemove}
            aria-label={`Remove ${label} filter`}
          >
            <Icon icon={XIcon} size="xs" />
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  )
}
