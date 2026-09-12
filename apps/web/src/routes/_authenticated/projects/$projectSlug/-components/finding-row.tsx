import { Button, cn, Icon, Text } from "@repo/ui"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"

export function FindingRow({
  label,
  leading,
  trailing,
  expanded = false,
  onToggle,
  className,
}: {
  readonly label: string
  readonly leading: ReactNode
  readonly trailing?: ReactNode
  readonly expanded?: boolean
  readonly onToggle?: (() => void) | undefined
  readonly className?: string
}) {
  const expandable = onToggle !== undefined

  return (
    <div
      className={cn(
        "flex min-w-0 items-center transition-colors",
        {
          "hover:bg-secondary/80": expandable,
          "bg-secondary": expanded,
        },
        className,
      )}
    >
      <div className="flex w-10 shrink-0 items-center justify-center">{leading}</div>
      {expandable ? (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-auto min-w-0 flex-1 rounded-none bg-transparent px-0 py-3 pr-4 font-normal text-muted-foreground hover:bg-transparent"
        >
          <button type="button" aria-label={label} aria-expanded={expanded} onClick={onToggle}>
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            {trailing}
            <Icon icon={expanded ? ChevronDownIcon : ChevronRightIcon} size="xs" color="foregroundMuted" />
          </button>
        </Button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4">
          <Text.H6 color="foregroundMuted" className="min-w-0 flex-1" ellipsis>
            {label}
          </Text.H6>
          {trailing}
        </div>
      )}
    </div>
  )
}
