import { ExternalLinkIcon, Loader2Icon, PlusIcon, TagsIcon } from "lucide-react"
import { BlankSlate } from "../../../../../../components/blank-slate.tsx"
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
  if (isDemoProject) {
    return (
      <BlankSlate
        icon={Loader2Icon}
        iconClassName="animate-spin"
        title="Sample behaviors are loading"
        description="We found the sample traces and signals. The behavior taxonomy is still being prepared, so check back in about a minute."
      />
    )
  }

  return (
    <BlankSlate
      icon={TagsIcon}
      title="No behaviors yet"
      description="Live taxonomy behaviors will appear here after sessions have been clustered."
      actions={[
        ...(onNewBehavior ? [{ label: "Behavior", icon: PlusIcon, onClick: onNewBehavior }] : []),
        { label: "Read the docs", icon: ExternalLinkIcon, href: "https://docs.latitude.so/search/behaviours" },
      ]}
    />
  )
}
