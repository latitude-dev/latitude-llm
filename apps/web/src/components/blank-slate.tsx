import { Button, Icon, Text } from "@repo/ui"
import type { LucideProps } from "lucide-react"
import type { ComponentType, ReactNode } from "react"

type BlankSlateIcon = ComponentType<LucideProps>

interface BlankSlateAction {
  readonly label: string
  readonly icon?: BlankSlateIcon | undefined
  readonly onClick?: (() => void) | undefined
  readonly href?: string | undefined
  readonly isLoading?: boolean | undefined
  readonly disabled?: boolean | undefined
  /** Overrides the position-based default (first action solid, the rest outline). */
  readonly variant?: "default" | "outline" | undefined
}

function BlankSlateButton({
  action,
  variant,
}: {
  readonly action: BlankSlateAction
  readonly variant: "default" | "outline"
}) {
  const content = (
    <>
      {action.icon ? <Icon size="sm" icon={action.icon} /> : null}
      {action.label}
    </>
  )
  if (action.href) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer">
        <Button variant={variant}>{content}</Button>
      </a>
    )
  }
  return (
    <Button
      variant={variant}
      onClick={action.onClick}
      disabled={action.disabled ?? false}
      isLoading={action.isLoading ?? false}
    >
      {content}
    </Button>
  )
}

/**
 * Left-aligned empty-state for a list the user can populate: an icon tile, title, description,
 * and up to a few actions, in a block centered on the page. Unless an action overrides its own
 * `variant`, the first renders solid and the rest outline — so a lone action (often just a docs
 * link, when there's nothing to click to populate the list) still reads as the page's one call
 * to action instead of a muted afterthought. Render it only when the list is empty and not
 * loading — it owns no loading state of its own.
 */
export function BlankSlate({
  icon,
  iconClassName,
  title,
  description,
  actions,
}: {
  readonly icon: BlankSlateIcon
  readonly iconClassName?: string | undefined
  readonly title: string
  readonly description: ReactNode
  readonly actions?: readonly BlankSlateAction[] | undefined
}) {
  return (
    <div className="h-full w-full flex flex-1 items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-start gap-6 text-left">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={icon} size="lg" color="foregroundMuted" className={iconClassName ?? ""} />
        </div>
        <div className="flex flex-col items-start gap-2">
          <Text.H3>{title}</Text.H3>
          <Text.H5 color="foregroundMuted">{description}</Text.H5>
        </div>
        {actions && actions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action, index) => (
              <BlankSlateButton
                key={action.label}
                action={action}
                variant={action.variant ?? (index === 0 ? "default" : "outline")}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
