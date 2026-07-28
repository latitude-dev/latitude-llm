import { Text } from "@repo/ui"

export interface AgentBreadcrumbSegment {
  readonly label: string
}

/**
 * Full-width trail above a drilled-into subagent conversation: one segment
 * per level from the main conversation down to the one currently shown.
 * Every segment but the last is clickable and jumps straight to that depth,
 * truncating anything deeper — the last segment is the current view.
 */
export function AgentBreadcrumb({
  segments,
  onSelect,
}: {
  readonly segments: readonly AgentBreadcrumbSegment[]
  readonly onSelect: (index: number) => void
}) {
  return (
    <div className="flex w-full shrink-0 items-center gap-4 border-b border-border bg-background px-4 py-2">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1
        return (
          <div key={index} className="flex items-center gap-4">
            {index > 0 && <Text.H5M color="foregroundMuted">/</Text.H5M>}
            {isLast ? (
              <Text.H5M color="foreground" noWrap>
                {segment.label}
              </Text.H5M>
            ) : (
              <button type="button" onClick={() => onSelect(index)} className="cursor-pointer">
                <Text.H5M color="foregroundMuted" noWrap>
                  {segment.label}
                </Text.H5M>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
