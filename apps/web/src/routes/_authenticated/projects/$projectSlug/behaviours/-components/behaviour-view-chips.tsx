import { cn, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"

const chipClass = (active: boolean) =>
  cn("flex h-7 max-w-48 items-center rounded px-2 transition-colors", {
    "border border-border bg-background": active,
    "border border-transparent hover:bg-background/60": !active,
  })

/**
 * The views of a behavior, as a row of links: the behavior's own tree first, then
 * each filtered slice. Rendered only when the behavior has views — a lone "All
 * sessions" chip would say nothing. Anchors rather than tabs so a view can be
 * cmd-clicked and lives at its own URL.
 */
export function BehaviourViewChips({
  projectSlug,
  behaviourSlug,
  views,
  activeViewSlug,
}: {
  readonly projectSlug: string
  readonly behaviourSlug: string
  readonly views: readonly CustomBehaviorRecord[]
  readonly activeViewSlug: string | null
}) {
  if (views.length === 0) return null

  return (
    <div className="flex w-fit max-w-full flex-row flex-wrap items-center gap-1 rounded-lg border border-border bg-secondary p-1">
      <Link
        to="/projects/$projectSlug/behaviours/$behaviourSlug"
        params={{ projectSlug, behaviourSlug }}
        className={chipClass(activeViewSlug === null)}
      >
        <Text.H5 color={activeViewSlug === null ? "foreground" : "foregroundMuted"} ellipsis noWrap>
          All sessions
        </Text.H5>
      </Link>
      {views.map((view) => (
        <Link
          key={view.id}
          to="/projects/$projectSlug/behaviours/$behaviourSlug/views/$viewSlug"
          params={{ projectSlug, behaviourSlug, viewSlug: view.slug }}
          className={chipClass(activeViewSlug === view.slug)}
        >
          <Text.H5 color={activeViewSlug === view.slug ? "foreground" : "foregroundMuted"} ellipsis noWrap>
            {view.name}
          </Text.H5>
        </Link>
      ))}
    </div>
  )
}
