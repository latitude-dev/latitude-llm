import { InboxIcon, type LucideIcon } from "lucide-react"

import { Button } from "../button/button.tsx"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"

interface EmptyStateAction {
  readonly label: string
  readonly onClick: () => void
  readonly icon?: LucideIcon
}

function EmptyState({
  icon = InboxIcon,
  message,
  action,
}: {
  readonly icon?: LucideIcon
  readonly message: string
  readonly action?: EmptyStateAction
}) {
  return (
    <div className="flex min-h-[120px] w-full flex-1 flex-col items-center justify-center gap-2 rounded-lg bg-secondary p-4">
      <Icon icon={icon} size="md" color="foregroundMuted" />
      <Text.H6 align="center" display="block" color="foregroundMuted" className="max-w-sm">
        {message}
      </Text.H6>
      {action ? (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.icon ? <Icon size="sm" icon={action.icon} /> : null}
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}

export { EmptyState }
