import { Text } from "@repo/ui"

export interface AgentBreadcrumbSegment {
  readonly label: string
}

const COLLAPSE_THRESHOLD = 4

type VisibleEntry =
  | { readonly kind: "segment"; readonly index: number; readonly label: string }
  | { readonly kind: "ellipsis" }

/**
 * At 4+ segments, only the root, the one level up, and the current segment
 * stay visible — everything else collapses behind a non-interactive "…", so
 * the trail reads "Conversation / … / One level up / Current" instead of
 * growing unbounded with drill-down depth.
 */
function visibleEntries(segments: readonly AgentBreadcrumbSegment[]): readonly VisibleEntry[] {
  if (segments.length < COLLAPSE_THRESHOLD) {
    return segments.map((segment, index) => ({ kind: "segment", index, label: segment.label }))
  }
  const lastIndex = segments.length - 1
  return [
    { kind: "segment", index: 0, label: segments[0]!.label },
    { kind: "ellipsis" },
    { kind: "segment", index: lastIndex - 1, label: segments[lastIndex - 1]!.label },
    { kind: "segment", index: lastIndex, label: segments[lastIndex]!.label },
  ]
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
      {visibleEntries(segments).map((entry, position) => (
        <div key={entry.kind === "segment" ? entry.index : `ellipsis-${position}`} className="flex items-center gap-4">
          {position > 0 && <Text.H5M color="foregroundMuted">/</Text.H5M>}
          {entry.kind === "ellipsis" ? (
            <Text.H5M color="foregroundMuted">…</Text.H5M>
          ) : entry.index === segments.length - 1 ? (
            <Text.H5M color="foreground" noWrap>
              {entry.label}
            </Text.H5M>
          ) : (
            <button type="button" onClick={() => onSelect(entry.index)} className="cursor-pointer">
              <Text.H5M color="foregroundMuted" noWrap>
                {entry.label}
              </Text.H5M>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
