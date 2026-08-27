import { Button, Icon, Text } from "@repo/ui"
import { ExternalLinkIcon, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

interface BlankSlateAction {
  readonly label: string
  readonly icon: LucideIcon
  readonly onClick: () => void
}

export function BlankSlate({
  icon,
  title,
  description,
  action,
  docsHref,
}: {
  readonly icon: LucideIcon
  readonly title: string
  readonly description: ReactNode
  readonly action: BlankSlateAction
  readonly docsHref?: string
}) {
  return (
    <div className="h-full w-full flex flex-1 items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={icon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>{title}</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            {description}
          </Text.H5>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={action.onClick}>
            <Icon size="sm" icon={action.icon} />
            {action.label}
          </Button>
          {docsHref ? (
            <a href={docsHref} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <Icon size="sm" icon={ExternalLinkIcon} />
                Read the docs
              </Button>
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
