import { memo } from "react"
import { useHashColor } from "../../hooks/use-hash-color.ts"
import { cn } from "../../utils/cn.ts"

export interface TagBadgeProps {
  readonly tag: string
  /** When set, the badge shrinks to this width and ellipsizes its text instead of overflowing. */
  readonly maxWidthPx?: number
}

const tagBadgeClassName = "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium"

export const TagBadge = memo(function TagBadge({ tag, maxWidthPx }: TagBadgeProps) {
  const { style, className } = useHashColor(tag)
  const truncate = maxWidthPx != null

  return (
    <span
      className={cn(tagBadgeClassName, className, { "min-w-0": truncate })}
      style={truncate ? { ...style, maxWidth: maxWidthPx } : style}
    >
      <span className={cn({ truncate })}>{tag}</span>
    </span>
  )
})

export interface TagBadgeListProps {
  readonly tags: readonly string[]
}

export function TagBadgeList({ tags }: TagBadgeListProps) {
  if (tags.length === 0) return null

  return (
    <div className="flex flex-row flex-wrap gap-1">
      {tags.map((tag) => (
        <TagBadge key={tag} tag={tag} />
      ))}
    </div>
  )
}
