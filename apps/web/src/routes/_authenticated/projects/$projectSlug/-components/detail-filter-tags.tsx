import { type FilterSet, filterSetSchema } from "@domain/shared"
import { Button, TagBadge, TagBadgeList, Tooltip } from "@repo/ui"

export function DetailFilterTags({
  tags,
  filters,
  onFiltersChange,
}: {
  readonly tags: readonly string[]
  readonly filters?: FilterSet | undefined
  readonly onFiltersChange?: ((filters: FilterSet) => void) | undefined
}) {
  if (!onFiltersChange) return <TagBadgeList tags={tags} />

  return (
    <div className="flex flex-row flex-wrap gap-1">
      {tags.map((tag) => {
        const current = filters ?? {}
        const next = addTagFilter({ filters: current, tag })
        const disabled = next === current
        return (
          <Tooltip
            key={tag}
            asChild
            trigger={
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={`Filter by tag ${tag}`}
                  onClick={() => onFiltersChange(next)}
                >
                  <TagBadge tag={tag} />
                </Button>
              </span>
            }
          >
            {disabled ? "Tag already applied or filter limit reached" : `Filter by tag ${tag}`}
          </Tooltip>
        )
      })}
    </div>
  )
}

function addTagFilter({ filters, tag }: { readonly filters: FilterSet; readonly tag: string }): FilterSet {
  const conditions = filters.tags ?? []
  if (conditions.some((condition) => condition.op === "contains" && condition.value === tag)) return filters
  const next: FilterSet = { ...filters, tags: [...conditions, { op: "contains", value: tag }] }
  return filterSetSchema.safeParse(next).success ? next : filters
}
