import { cn, Text } from "@repo/ui"
import type { ReactNode } from "react"

interface SectionHeaderProps {
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly badge?: ReactNode
  readonly className?: string
  readonly variant?: "default" | "xl"
}

export function SectionHeader({ title, description, badge, className, variant = "default" }: SectionHeaderProps) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col", variant === "xl" ? "gap-0.5" : "gap-1", className)}>
      <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1">
        {typeof title === "string" ? (
          variant === "xl" ? (
            <Text.H3M className="min-w-0 shrink">{title}</Text.H3M>
          ) : (
            <Text.H4M className="min-w-0 shrink">{title}</Text.H4M>
          )
        ) : (
          title
        )}
        {badge ? <span className="flex shrink-0">{badge}</span> : null}
      </div>
      {description !== undefined && description !== null ? (
        <div className="max-w-[400px]">
          {typeof description === "string" ? <Text.H5 color="foregroundMuted">{description}</Text.H5> : description}
        </div>
      ) : null}
    </div>
  )
}
