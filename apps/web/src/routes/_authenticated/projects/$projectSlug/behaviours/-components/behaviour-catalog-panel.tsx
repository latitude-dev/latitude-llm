import { cn, Text } from "@repo/ui"
import { formatCount, formatPercentage } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import type {
  BehaviourCatalogEntryRecord,
  BehaviourCatalogGroupRecord,
} from "../../../../../../domains/taxonomy/behaviour-catalog.functions.ts"
import { groupColorClassAt } from "../../../../../../domains/taxonomy/group-colors.ts"
import { BehaviourBadge, trendIcon, trendLabel } from "../../../../../../domains/taxonomy/trend-display.tsx"
import { PreviewPlaceholder } from "./behaviour-catalog-card.tsx"

/** The Behaviors home: a full-width panel per behavior, stacked top to bottom. */
export const BEHAVIOUR_LIST_CLASS = "flex flex-col gap-4"

const PANEL_CLASS =
  "flex flex-col overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-foreground/20"

function GroupRow({
  group,
  colorIndex,
  totalSessionCount,
}: {
  readonly group: BehaviourCatalogGroupRecord
  readonly colorIndex: number
  readonly totalSessionCount: number
}) {
  const share = totalSessionCount > 0 ? group.sessionCount / totalSessionCount : 0
  return (
    <div className="flex flex-row items-start gap-4 rounded-md bg-secondary px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-row items-start gap-2">
        <span className={cn("mt-2 size-[5px] shrink-0 rounded-full", groupColorClassAt(colorIndex))} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Text.H5 color="foreground">{group.name}</Text.H5>
          {group.description ? <Text.H6 color="foregroundMuted">{group.description}</Text.H6> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-row items-center gap-6">
        <div className="flex flex-row items-center gap-1">
          <Text.H5 color="foregroundMuted" noWrap>
            {formatPercentage(share)}
          </Text.H5>
          <Text.H5 color="foregroundMuted" noWrap>
            ·
          </Text.H5>
          <Text.H5 color="foreground" noWrap>
            {`${formatCount(group.sessionCount)} sessions`}
          </Text.H5>
        </div>
        <BehaviourBadge label={trendLabel(group.trend)} icon={trendIcon(group.trend)} />
      </div>
    </div>
  )
}

/** Each top-level group's slice of the facet's sessions, in its row's color — predominance at a glance. */
function GroupShareBar({ groups }: { readonly groups: readonly BehaviourCatalogGroupRecord[] }) {
  return (
    <div className="flex h-1 w-[136px] shrink-0 overflow-hidden rounded-full bg-muted">
      {groups.map((group, index) => (
        <div
          key={group.id}
          className={groupColorClassAt(index)}
          style={{ flexGrow: group.sessionCount || 0, flexBasis: 0 }}
        />
      ))}
    </div>
  )
}

function PanelHeader({ entry }: { readonly entry: BehaviourCatalogEntryRecord }) {
  const hasGroups = entry.groups.length > 0
  return (
    <div className="flex flex-row items-start justify-between gap-4 bg-muted px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text.H5M ellipsis noWrap>
          {entry.name}
        </Text.H5M>
        <Text.H6 color="foregroundMuted" className="max-w-[400px]">
          {entry.description}
        </Text.H6>
      </div>
      <div className="flex shrink-0 flex-row items-center gap-3">
        {entry.groups.length > 1 ? <GroupShareBar groups={entry.groups} /> : null}
        <Text.H6 color="foregroundMuted" noWrap>
          {entry.status === "generating"
            ? "Analyzing"
            : hasGroups
              ? `${formatCount(entry.sessionCount)} sessions${entry.viewCount > 0 ? ` · ${entry.viewCount} ${entry.viewCount === 1 ? "view" : "views"}` : ""}`
              : null}
        </Text.H6>
      </div>
    </div>
  )
}

/**
 * A behavior's panel content: a header naming the question it groups sessions by,
 * then every top-level group it found — the tree's roots, not its nested
 * breakdowns, but none of the roots themselves are hidden.
 */
function PanelBody({ entry }: { readonly entry: BehaviourCatalogEntryRecord }) {
  if (entry.groups.length === 0) {
    return (
      <div className="border-t border-border p-4">
        <PreviewPlaceholder generating={entry.status === "generating"} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1 border-t border-border p-4">
      {entry.groups.map((group, index) => (
        <GroupRow key={group.id} group={group} colorIndex={index} totalSessionCount={entry.sessionCount} />
      ))}
    </div>
  )
}

/**
 * One behavior on the Behaviors home; the whole panel is the link into its tree —
 * unless there is no tree to open yet, in which case it is inert. The catalog read
 * empties `groups` for a tree the tree screen would refuse to render, so linking
 * here would land on "No behaviors yet".
 */
export function BehaviourCatalogPanel({
  projectSlug,
  entry,
}: {
  readonly projectSlug: string
  readonly entry: BehaviourCatalogEntryRecord
}) {
  if (entry.groups.length === 0) {
    return (
      <div className={PANEL_CLASS}>
        <PanelHeader entry={entry} />
        <PanelBody entry={entry} />
      </div>
    )
  }
  return (
    <Link
      to="/projects/$projectSlug/behaviours/$behaviourSlug"
      params={{ projectSlug, behaviourSlug: entry.slug }}
      aria-label={`Open the ${entry.name} behavior`}
      className={PANEL_CLASS}
    >
      <PanelHeader entry={entry} />
      <PanelBody entry={entry} />
    </Link>
  )
}
