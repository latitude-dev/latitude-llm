import { cn, Text } from "@repo/ui"
import type { ReactNode } from "react"

interface SettingsPageTitleProps {
  readonly children: ReactNode
}

export function SettingsPageTitle({ children }: SettingsPageTitleProps) {
  return <Text.H3M>{children}</Text.H3M>
}

interface SettingsPageProps {
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly actions?: ReactNode
  readonly children: ReactNode
  /**
   * When true, the title/description/actions header sticks to the top of the scroll
   * container with a background + bottom border. Use this to surface action controls
   * (e.g. Apply/Discard) when the page has unsaved changes.
   */
  readonly headerSticky?: boolean
}

export function SettingsPage({ title, description, actions, children, headerSticky = false }: SettingsPageProps) {
  const header = (
    <div className="flex flex-col gap-1">
      {typeof title === "string" ? <SettingsPageTitle>{title}</SettingsPageTitle> : title}
      {description ? <Text.H6M color="foregroundMuted">{description}</Text.H6M> : null}
    </div>
  )

  return (
    <>
      <div
        className={cn("flex flex-row items-center justify-between gap-4", {
          "sticky top-0 z-10 -mx-6 border-b border-border bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80":
            headerSticky,
        })}
      >
        {header}
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </>
  )
}
