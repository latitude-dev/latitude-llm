import type { CSSProperties } from "react"
import { useHashColor } from "../../hooks/use-hash-color.ts"
import { cn } from "../../utils/cn.ts"

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl"

const sizeClass: Record<AvatarSize, string> = {
  xs: "h-5 w-5 text-[8px]",
  sm: "h-6 w-6 text-xs",
  md: "h-7 w-7 text-[10px]",
  lg: "h-8 w-8 text-sm",
  // Detail-page hero scale (~56 px). Used by the backoffice
  // user / organisation dashboards so the leading visual matches
  // the height of the title + subtitle stack.
  xl: "h-14 w-14 text-xl",
}

export function initialsFromDisplayName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) return "?"

  const firstWord = trimmed.split(/\s+/).find(Boolean)
  if (!firstWord) return "?"

  return Array.from(firstWord)[0]?.toUpperCase() ?? "?"
}

export interface AvatarProps {
  readonly name: string
  readonly imageSrc?: string | null
  readonly size?: AvatarSize
  /** When true, adds a ring matching stacked {@link AvatarGroup} usage. */
  readonly stacked?: boolean
  readonly className?: string
}

export function Avatar({ name, imageSrc, size = "sm", stacked = false, className }: AvatarProps) {
  const trimmed = name.trim()
  const hashKey = trimmed.length > 0 ? trimmed : "anonymous"
  const { style, className: hashClass } = useHashColor(hashKey)
  const initials = initialsFromDisplayName(trimmed.length > 0 ? trimmed : "")

  const ring = stacked ? "border-2 border-background" : ""
  const sz = sizeClass[size]

  if (imageSrc) {
    return (
      <span className={cn("inline-flex shrink-0 overflow-hidden rounded-full bg-muted", ring, sz, className)}>
        <img src={imageSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
      </span>
    )
  }

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium leading-none",
        ring,
        sz,
        hashClass,
        className,
      )}
      style={style as CSSProperties}
    >
      <span className="leading-none">{initials}</span>
    </div>
  )
}
