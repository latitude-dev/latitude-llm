import { memo } from "react"
import { useHashColor } from "../../hooks/use-hash-color.ts"
import { cn } from "../../utils/cn.ts"

export type TagBadgeVariant = "hash" | "accent"

export interface TagBadgeProps {
  readonly tag: string
  readonly variant?: TagBadgeVariant
}

const tagBadgeClassName = "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium"

function HashTagBadge({ tag }: { readonly tag: string }) {
  const { style, className } = useHashColor(tag)

  return (
    <span className={cn(tagBadgeClassName, className)} style={style}>
      {tag}
    </span>
  )
}

export const TagBadge = memo(function TagBadge({ tag, variant = "hash" }: TagBadgeProps) {
  if (variant === "accent") {
    return <span className={cn(tagBadgeClassName, "bg-accent text-accent-foreground")}>{tag}</span>
  }

  return <HashTagBadge tag={tag} />
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
