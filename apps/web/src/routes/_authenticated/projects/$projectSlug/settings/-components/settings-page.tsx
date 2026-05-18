import { Text } from "@repo/ui"
import type { ReactNode } from "react"

interface SettingsPageProps {
  title: string
  description?: string
  children: ReactNode
}

export function SettingsPage({ title, description, children }: SettingsPageProps) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Text.H3 weight="bold">{title}</Text.H3>
        {description ? <Text.H5 color="foregroundMuted">{description}</Text.H5> : null}
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </>
  )
}
