import { Button, cn, Icon, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { HourglassIcon, Loader2Icon } from "lucide-react"
import type {
  BehaviourCatalogEntryRecord,
  BehaviourCatalogGroupRecord,
} from "../../../../../../domains/taxonomy/behaviour-catalog.functions.ts"

/** The behaviors grid: one column per ~400px, three at most. Shared by the home and the view picker. */
export const BEHAVIOUR_GRID_CLASS = "grid grid-cols-1 gap-4 @[50rem]:grid-cols-2 @[75rem]:grid-cols-3"

// Deeper top inset than the other sides, so the name gets some air above it. No
// fixed ratio: the card is as tall as what it has to show, and the grid squares up
// the cards in a row for us. `group relative` is what the hover overlay hangs off.
export const BEHAVIOUR_CARD_CLASS =
  "group relative flex flex-col gap-3 rounded-xl border border-border p-5 pt-8 text-left transition-colors hover:border-foreground/20"

/** Widens the card's one uniform gap to 3× where the teaser starts, setting it apart from the blurb. */
const PREVIEW_TOP_GAP = "pt-6"

// Nested rows step in so the teaser reads as a tree rather than a flat list. No
// margins by convention, so the indent is padding on the row itself.
const rowPadding = (depth: number) => {
  if (depth === 0) return "pl-2.5"
  if (depth === 1) return "pl-6"
  return "pl-9"
}

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
          <div
            key={group.id}
            className={cn("flex flex-row items-center gap-2 rounded-md py-1.5 pr-2.5", rowPadding(group.depth), {
              "bg-muted": group.depth === 0,
              "bg-muted/50": group.depth > 0,
            })}
          >
            <Text.H6
              color={group.depth === 0 ? "foreground" : "foregroundMuted"}
              ellipsis
              noWrap
              className="min-w-0 flex-1"
            >
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

function PreviewPlaceholder({ generating }: { readonly generating: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-md bg-muted/50 p-4 text-center">
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
 * teaser of the groups it found. Rendered inside a link on the home grid and
 * inside a button in the view picker, so it carries no interaction of its own.
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

/**
 * One behavior on the Behaviors home; the whole card is the link into its tree —
 * unless there is no tree to open yet, in which case it is inert. The catalog read
 * empties `groups` for a tree the tree screen would refuse to render, so linking
 * here would land on "No behaviors yet".
 */
export function BehaviourCatalogCard({
  projectSlug,
  entry,
}: {
  readonly projectSlug: string
  readonly entry: BehaviourCatalogEntryRecord
}) {
  if (entry.groups.length === 0) {
    return (
      <div className={BEHAVIOUR_CARD_CLASS}>
        <BehaviourCardBody entry={entry} />
      </div>
    )
  }
  return (
    <Link
      to="/projects/$projectSlug/behaviours/$behaviourSlug"
      params={{ projectSlug, behaviourSlug: entry.slug }}
      aria-label={`Open the ${entry.name} behavior`}
      className={BEHAVIOUR_CARD_CLASS}
    >
      <BehaviourCardBody entry={entry} />
      {/* The card itself is the link, so this is a label, not a button — nesting a
          real one inside an anchor would be invalid and steal the click. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/40 opacity-0 backdrop-blur-[3px] transition-opacity duration-200 group-hover:opacity-100">
        <Button asChild variant="outline" className="w-auto">
          <span>View behavior</span>
        </Button>
      </div>
    </Link>
  )
}
