import { Button, Icon, Text } from "@repo/ui"
import { XIcon } from "lucide-react"
import type { ReactNode } from "react"

interface FilterSectionProps {
  readonly label: string
  readonly children: ReactNode
  readonly onRemove?: () => void
  readonly layout?: "card" | "compact"
}

export function FilterSection({ label, children, onRemove, layout = "card" }: FilterSectionProps) {
  if (layout === "compact") {
    return (
      <div className="flex flex-col gap-1.5">
        <Text.H6 color="foregroundMuted">{label}</Text.H6>
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">{children}</div>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              onClick={onRemove}
              aria-label={`Remove ${label} filter`}
            >
              <Icon icon={XIcon} size="xs" />
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

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
