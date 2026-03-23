import { memo, useMemo } from "react"

function hashToHue(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(31, hash) + text.charCodeAt(i)
    hash |= 0
  }
  return ((hash % 360) + 360) % 360
}

export interface TagBadgeProps {
  readonly tag: string
}

export const TagBadge = memo(function TagBadge({ tag }: TagBadgeProps) {
  const style = useMemo(() => {
    const hue = hashToHue(tag)
    return {
      backgroundColor: `hsl(${hue} 50% 92%)`,
      color: `hsl(${hue} 40% 35%)`,
    }
  }, [tag])

  const darkStyle = useMemo(() => {
    const hue = hashToHue(tag)
    return {
      "--tag-bg": `hsl(${hue} 30% 20%)`,
      "--tag-fg": `hsl(${hue} 40% 75%)`,
    } as React.CSSProperties
  }, [tag])

  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium dark:bg-(--tag-bg)! dark:text-(--tag-fg)!"
      style={{ ...style, ...darkStyle }}
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
