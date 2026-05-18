import { Text } from "@repo/ui"
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
}

export function SettingsPage({ title, description, actions, children }: SettingsPageProps) {
  const header = (
    <div className="flex flex-col gap-1">
      {typeof title === "string" ? <SettingsPageTitle>{title}</SettingsPageTitle> : title}
      {description ? <Text.H6M color="foregroundMuted">{description}</Text.H6M> : null}
    </div>
  )

  return (
    <>
      {actions ? (
        <div className="flex flex-row items-start justify-between gap-4">
          {header}
          <div className="shrink-0">{actions}</div>
        </div>
      ) : (
        header
      )}
      <div className="flex flex-col gap-6">{children}</div>
    </>
  )
}
