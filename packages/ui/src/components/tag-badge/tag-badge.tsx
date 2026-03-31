import { memo } from "react"
import { useHashColor } from "../../hooks/use-hash-color.ts"
import { cn } from "../../utils/cn.ts"

export interface TagBadgeProps {
  readonly tag: string
}

export const TagBadge = memo(function TagBadge({ tag }: TagBadgeProps) {
  const { style, className } = useHashColor(tag)

  return (
    <span
      className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium", className)}
      style={style}
    >
      {tag}
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
