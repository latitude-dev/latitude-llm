import { cn } from "@repo/ui"
import type { ReactNode } from "react"
import { SectionHeader } from "../../-components/section-header.tsx"

interface SettingsPageTitleProps {
  readonly children: ReactNode
}

export function SettingsPageTitle({ children }: SettingsPageTitleProps) {
  return <SectionHeader title={children} variant="xl" />
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
  const header = <SectionHeader title={title} description={description} variant="xl" className="min-w-48" />

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
