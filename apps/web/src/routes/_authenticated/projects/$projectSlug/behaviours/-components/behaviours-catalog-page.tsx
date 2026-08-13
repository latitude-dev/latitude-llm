import type { FilterSet } from "@domain/shared"
import { Button, Icon, Skeleton, Text } from "@repo/ui"
import { PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useBehaviourCatalog } from "../../../../../../domains/taxonomy/behaviour-catalog.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import type { useRouteProject } from "../../-route-data.ts"
import { BEHAVIOUR_LIST_CLASS, BehaviourCatalogPanel } from "./behaviour-catalog-panel.tsx"
import { BehaviourFormModal } from "./behaviour-form-modal.tsx"
import { GlobalEmptyState, isDemoProject } from "./behaviours-empty-state.tsx"
import { NewBehaviorModal } from "./new-behavior-modal.tsx"

type RouteProject = ReturnType<typeof useRouteProject>

/**
 * The Behaviors home: every behavior in the project as a panel with a preview of
 * its top groups, so "a behavior is a way of grouping your sessions, and you can
 * add more" is visible without opening anything. Clicking a panel opens that
 * behavior's tree.
 */
export function BehavioursCatalogPage({
  project,
  newView,
  onNewViewClose,
}: {
  readonly project: RouteProject
  /** Route-driven: open the new-view form over the list (the Sessions entry point). */
  readonly newView?: { readonly initialFilterSet?: FilterSet }
  readonly onNewViewClose?: () => void
}) {
  const { data: entries, isLoading } = useBehaviourCatalog(project.id)
  const [newBehaviorOpen, setNewBehaviorOpen] = useState(false)

  // Only the topic behavior, and it has nothing grouped: there is no taxonomy at
  // all yet, so a list of one empty panel would be noise. The title and its
  // explainer go with it — there is nothing yet for them to introduce — so the
  // blank slate takes the whole screen and carries the actions itself.
  const showEmpty = !isLoading && entries.length === 1 && entries[0]?.groups.length === 0

  // A stable sort: behaviors with groups already found stay above ones still
  // waiting or analyzing, so the list leads with what's actually explorable.
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => Number(b.groups.length > 0) - Number(a.groups.length > 0)),
    [entries],
  )

  // The modals sit OUTSIDE Layout: ListingLayout renders only its Content/Aside
  // children and drops anything else, so a modal placed under it never mounts.
  return (
    <>
      {/* Scroll on the whole column, not on the list: the title scrolls away with the panels rather than pinning. */}
      {/* gap-6 overrides ListingLayout's default gap-3: the list needs more separation from the header than that section-internal spacing gives it. */}
      <Layout className="overflow-y-auto gap-6">
        <Layout.Content>
          {showEmpty ? null : (
            <Layout.Header
              title="Behaviors"
              description={
                <Text.H5 color="foregroundMuted" className="max-w-[400px]">
                  Each behavior groups your sessions by a different question: what they were about, what the user
                  wanted, how they ended. Open one to explore its groups.
                </Text.H5>
              }
              actions={
                <Button onClick={() => setNewBehaviorOpen(true)}>
                  <Icon icon={PlusIcon} size="sm" />
                  Group
                </Button>
              }
            />
          )}
          {showEmpty ? (
            <GlobalEmptyState isDemoProject={isDemoProject(project)} onNewBehavior={() => setNewBehaviorOpen(true)} />
          ) : (
            <div className="px-6 pb-6">
              <div className={BEHAVIOUR_LIST_CLASS}>
                {isLoading
                  ? [0, 1, 2].map((index) => <Skeleton key={index} className="h-40 w-full rounded-lg" />)
                  : sortedEntries.map((entry) => (
                      <BehaviourCatalogPanel key={entry.slug} projectSlug={project.slug} entry={entry} />
                    ))}
              </div>
            </div>
          )}
        </Layout.Content>
      </Layout>
      {newBehaviorOpen ? <NewBehaviorModal project={project} onClose={() => setNewBehaviorOpen(false)} /> : null}
      {newView ? (
        <BehaviourFormModal
          project={project}
          {...(newView.initialFilterSet ? { initialFilterSet: newView.initialFilterSet } : {})}
          onClose={() => onNewViewClose?.()}
        />
      ) : null}
    </>
  )
}
