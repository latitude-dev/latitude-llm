import { cn, Icon, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { HourglassIcon, Loader2Icon } from "lucide-react"
import type {
  BehaviourCatalogEntryRecord,
  BehaviourCatalogGroupRecord,
} from "../../../../../../domains/taxonomy/behaviour-catalog.functions.ts"

/** The view picker's card grid: one column per ~400px, three at most. */
export const BEHAVIOUR_GRID_CLASS = "grid grid-cols-1 gap-4 @[50rem]:grid-cols-2 @[75rem]:grid-cols-3"

// Deeper top inset than the other sides, so the name gets some air above it. No
// fixed ratio: the card is as tall as what it has to show, and the grid squares up
// the cards in a row for us.
export const BEHAVIOUR_CARD_CLASS =
  "flex flex-col gap-3 rounded-xl border border-border p-5 pt-8 text-left transition-colors hover:border-foreground/20"

/** Widens the card's one uniform gap to 3× where the teaser starts, setting it apart from the blurb. */
const PREVIEW_TOP_GAP = "pt-6"

// Dissolves the tail of the teaser downward, so it reads as a peek at a tree that
// carries on rather than a list that happens to stop. A mask, not an overlay
// gradient: it fades the rows themselves, so it stays correct over the card's
// hover background instead of painting a mismatched block of page color.
// Anchored to the rows, not to the area they sit in: the area is taller than the
// list, so a stop measured against it would fall in the empty space above and
// never show.
const PREVIEW_FADE =
  "[-webkit-mask-image:linear-gradient(to_bottom,black_calc(100%-2.75rem),transparent)] [mask-image:linear-gradient(to_bottom,black_calc(100%-2.75rem),transparent)]"

/** Below this there is no tail to dissolve, and fading the only rows looks broken. */
const PREVIEW_FADE_MIN_ROWS = 4

function GroupsPreview({ groups }: { readonly groups: readonly BehaviourCatalogGroupRecord[] }) {
  return (
    // Sizes to its rows and clips when there's no room for them all: the card's
    // content flows from the top, so any slack lands at the bottom.
    <div className={cn("flex min-h-0 flex-col overflow-hidden", PREVIEW_TOP_GAP)}>
      <div className={cn("flex flex-col gap-1", { [PREVIEW_FADE]: groups.length >= PREVIEW_FADE_MIN_ROWS })}>
        {groups.map((group) => (
          <div key={group.id} className="flex flex-row items-center gap-2 rounded-md bg-muted py-1.5 px-2.5">
            <Text.H6 color="foreground" ellipsis noWrap className="min-w-0 flex-1">
              {group.name}
            </Text.H6>
            <Text.H6 color="foregroundMuted" noWrap>
              {formatCount(group.sessionCount)}
            </Text.H6>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PreviewPlaceholder({ generating }: { readonly generating: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {generating ? (
        <Icon icon={Loader2Icon} color="foregroundMuted" className="animate-spin" />
      ) : (
        <Icon icon={HourglassIcon} size="md" color="foregroundMuted" />
      )}
      <Text.H6 color="foregroundMuted" centered>
        {generating
          ? "Analyzing your sessions. The groups appear here as soon as they're ready."
          : "Waiting for enough sessions to build the groups."}
      </Text.H6>
    </div>
  )
}

/**
 * A behavior's card content, flowing top down: what it groups sessions by, then a
 * teaser of the groups it found. Rendered inside a button in the view picker, so
 * it carries no interaction of its own.
 */
export function BehaviourCardBody({ entry }: { readonly entry: BehaviourCatalogEntryRecord }) {
  const hasGroups = entry.groups.length > 0
  return (
    <>
      <div className="flex shrink-0 flex-col gap-2">
        <Text.H4M ellipsis noWrap>
          {entry.name}
        </Text.H4M>
        <Text.H5 lineClamp={3}>{entry.description}</Text.H5>
      </div>
      {hasGroups ? (
        <GroupsPreview groups={entry.groups} />
      ) : (
        <div className={cn("flex min-h-0 flex-1 flex-col", PREVIEW_TOP_GAP)}>
          <PreviewPlaceholder generating={entry.status === "generating"} />
        </div>
      )}
      <div className="flex shrink-0 flex-row items-center gap-1.5">
        <Text.H6 color="foregroundMuted">
          {hasGroups ? `${formatCount(entry.sessionCount)} sessions` : "No sessions grouped yet"}
        </Text.H6>
        {entry.viewCount > 0 ? (
          <Text.H6 color="foregroundMuted">{`· ${entry.viewCount} ${entry.viewCount === 1 ? "view" : "views"}`}</Text.H6>
        ) : null}
      </div>
    </>
  )
}
