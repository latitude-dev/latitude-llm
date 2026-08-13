import { Button, Icon, Text } from "@repo/ui"
import { ExternalLinkIcon, Loader2Icon, PlusIcon, TagsIcon } from "lucide-react"
import type { useRouteProject } from "../../-route-data.ts"

type RouteProject = ReturnType<typeof useRouteProject>

const isDemoProjectName = (name: string) => /(^|\b)demo project(\b|$)/i.test(name)

/** The seeded demo project gardens shortly after it lands, so its cold start reads as "loading", not "empty". */
export const isDemoProject = (project: RouteProject) => project.settings.isSample || isDemoProjectName(project.name)

/**
 * Nothing has been grouped in this project yet: no topic tree, and so nothing a
 * behavior could slice either. Shown in place of the behaviors grid and in place
 * of the topic tree.
 *
 * `onNewBehavior` is what the Behaviors home passes to carry the page's primary
 * action down here, since the header is hidden when there is nothing to head. The
 * legacy screen omits it — behaviors can't be created while the flag is off.
 */
export function GlobalEmptyState({
  isDemoProject,
  onNewBehavior,
}: {
  readonly isDemoProject: boolean
  readonly onNewBehavior?: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
        {isDemoProject ? (
          <Icon icon={Loader2Icon} size="md" color="foregroundMuted" className="animate-spin" />
        ) : (
          <TagsIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col items-center gap-2">
        <Text.H3>{isDemoProject ? "Sample behaviors are loading" : "No behaviors yet"}</Text.H3>
        <Text.H5 color="foregroundMuted" centered className="max-w-md">
          {isDemoProject
            ? "We found the sample traces and signals. The behavior taxonomy is still being prepared, so check back in about a minute."
            : "Live taxonomy behaviors will appear here after sessions have been clustered."}
        </Text.H5>
      </div>
      {isDemoProject ? null : (
        <div className="flex flex-row items-center gap-2">
          <Button asChild variant={onNewBehavior ? "outline" : "default"}>
            <a href="https://docs.latitude.so/search/behaviours" target="_blank" rel="noopener noreferrer">
              <Icon size="sm" icon={ExternalLinkIcon} />
              Read the docs
            </a>
          </Button>
          {onNewBehavior ? (
            <Button onClick={onNewBehavior}>
              <Icon size="sm" icon={PlusIcon} />
              Behavior
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
