import { cn, Text } from "@repo/ui"

export function SettingsPageHeader({
  title,
  description,
  className,
}: {
  title: string
  description: string
  className?: string
}) {
  return (
    <header className={cn("flex flex-col gap-1", className)}>
      <Text.H3>{title}</Text.H3>
      <Text.H6 color="foregroundMuted">{description}</Text.H6>
    </header>
  )
}
