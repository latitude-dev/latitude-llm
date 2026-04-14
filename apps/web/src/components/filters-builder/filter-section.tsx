import { Button, Icon, Text } from "@repo/ui"
import { XIcon } from "lucide-react"
import type { ReactNode } from "react"

interface FilterSectionProps {
  readonly label: string
  readonly children: ReactNode
  readonly onRemove?: () => void
}

export function FilterSection({ label, children, onRemove }: FilterSectionProps) {
  return (
    <div className="flex flex-col gap-2 border rounded-md p-3">
      <div className="flex items-center justify-between">
        <Text.H5>{label}</Text.H5>
        {onRemove && (
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Icon icon={XIcon} size="sm" />
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}
