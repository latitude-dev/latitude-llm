import type { ReactNode } from "react"
import { cn } from "../../utils/cn.ts"
import { Tooltip } from "../tooltip/tooltip.tsx"
import { Avatar, type AvatarSize } from "./avatar.tsx"

const overflowChipClass: Record<AvatarSize, string> = {
  xs: "h-5 min-w-5 text-[8px]",
  sm: "h-6 min-w-6 text-xs",
  md: "h-7 min-w-7 text-[10px]",
  lg: "h-8 min-w-8 text-sm",
  xl: "h-14 min-w-14 text-xl",
}

export interface AvatarGroupItem {
  readonly id?: string
  readonly name: string
  readonly imageSrc?: string | null
}

export interface AvatarGroupProps {
  readonly items: readonly AvatarGroupItem[]
  /** Visible avatars before the `+N` overflow chip. @default 3 */
  readonly maxVisible?: number
  readonly size?: AvatarSize
  readonly className?: string
  /** Rendered when `items` is empty. */
  readonly empty?: ReactNode
  /** Disable per-avatar name tooltips. Useful when the parent already provides a tooltip. */
  readonly disableTooltips?: boolean
}

export function AvatarGroup({
  items,
  maxVisible = 3,
  size = "md",
  className,
  empty = null,
  disableTooltips = false,
}: AvatarGroupProps) {
  if (items.length === 0) {
    return empty
  }

  const visible = items.slice(0, maxVisible)
  const extraCount = items.length - visible.length
  const overflowItems = items.slice(maxVisible)
  const overflowLabel = overflowItems.map((i) => i.name).join(", ")

  return (
    <div className={cn("flex items-center px-1", className)}>
      {visible.map((item, i) => {
        const avatar = (
          <span className={cn("relative inline-flex", i > 0 && "-ml-2")} style={{ zIndex: visible.length - i }}>
            <Avatar name={item.name} imageSrc={item.imageSrc ?? null} size={size} stacked />
          </span>
        )
        if (disableTooltips) {
          return <span key={item.id ?? `${item.name}-${i}`}>{avatar}</span>
        }
        return (
          <Tooltip key={item.id ?? `${item.name}-${i}`} asChild trigger={avatar}>
            {item.name}
          </Tooltip>
        )
      })}
      {extraCount > 0
        ? (() => {
            const chip = (
              <span
                className={cn(
                  "-ml-2 inline-flex shrink-0 items-center justify-center rounded-full border-2 border-background bg-secondary px-1 font-medium text-muted-foreground",
                  overflowChipClass[size],
                )}
                style={{ zIndex: 0 }}
              >
                +{extraCount}
              </span>
            )
            if (disableTooltips) return chip
            return (
              <Tooltip asChild trigger={chip}>
                {overflowLabel}
              </Tooltip>
            )
          })()
        : null}
    </div>
  )
}
