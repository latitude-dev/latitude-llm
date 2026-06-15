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
  readonly headerSticky?: boolean
  readonly fillHeight?: boolean
}

export function SettingsPage({
  title,
  description,
  actions,
  children,
  headerSticky = false,
  fillHeight = false,
}: SettingsPageProps) {
  const header = (
    <div className="flex min-w-48 flex-1 flex-col gap-1">
      {typeof title === "string" ? <SettingsPageTitle>{title}</SettingsPageTitle> : title}
      {description ? <Text.H6M color="foregroundMuted">{description}</Text.H6M> : null}
    </div>
  )

  return (
    <>
      <div
        className={cn("flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2", {
          "sticky top-0 z-10 -mx-6 border-b border-border bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80":
            headerSticky,
        })}
      >
        {header}
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className={cn("flex flex-col gap-6", { "min-h-0 flex-1": fillHeight })}>{children}</div>
    </>
  )
}
