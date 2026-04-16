import { Text } from "@repo/ui"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * In-card empty state for project home sections (Figma-aligned: gradient, icon, centered copy).
 */
export function ProjectHomeSectionBlankSlate({
  icon: Icon,
  title,
  description,
  action,
}: {
  readonly icon: LucideIcon
  readonly title: string
  readonly description?: string
  readonly action?: ReactNode
}) {
  return (
    <div className="flex w-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-muted/25 to-transparent px-4 py-10 text-center">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <Text.H5 align="center" display="block" color="foregroundMuted" className="max-w-md">
        {title}
      </Text.H5>
      {description ? (
        <Text.H6 align="center" display="block" color="foregroundMuted" className="max-w-lg">
          {description}
        </Text.H6>
      ) : null}
      {action ? <div className="mt-1 flex flex-row flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  )
}
