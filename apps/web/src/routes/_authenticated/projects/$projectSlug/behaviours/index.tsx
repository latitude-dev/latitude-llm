import { Icon, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { LockIcon, TagsIcon } from "lucide-react"
import { useMemo } from "react"
import { useHasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import { type BehaviourSegment, useProjectBehaviours } from "../../../../../domains/taxonomy/taxonomy.collection.ts"
import type { BehaviourNodeRecord } from "../../../../../domains/taxonomy/taxonomy.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { useRouteProject } from "../-route-data.ts"
import { BehaviourDetailDrawer, BehavioursView } from "./-components/behaviours-view.tsx"

function BehavioursBreadcrumb() {
  return (
    <span className="flex items-center gap-2">
      <TagsIcon className="h-4 w-4 text-muted-foreground" />
      <BreadcrumbText variant="current">Behaviours</BreadcrumbText>
    </span>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/behaviours/")({
  staticData: {
    breadcrumb: BehavioursBreadcrumb,
  },
  component: BehavioursPage,
})

function BehavioursPage() {
  const behavioursEnabled = useHasFeatureFlag("behaviours")

  if (!behavioursEnabled) {
    return (
      <Layout>
        <Layout.Content>
          <FeatureFlagOffSplash />
        </Layout.Content>
      </Layout>
    )
  }

  return <BehavioursPageContent />
}

function BehavioursPageContent() {
  const project = useRouteProject()
  const [segment, setSegment] = useParamState("behaviourSegment", "all", {
    validate: (value): value is BehaviourSegment =>
      value === "all" || value === "new_this_week" || value === "spiking" || value === "high_escalation",
  })
  const [activeBehaviourId, setActiveBehaviourId] = useParamState("behaviourId", "")
  const [timeFrom, setTimeFrom] = useParamState("behaviourTimeFrom", "")
  const [timeTo, setTimeTo] = useParamState("behaviourTimeTo", "")
  const timeRange = useMemo(
    () =>
      timeFrom || timeTo
        ? {
            ...(timeFrom ? { fromIso: timeFrom } : {}),
            ...(timeTo ? { toIso: timeTo } : {}),
          }
        : undefined,
    [timeFrom, timeTo],
  )
  const { data, isLoading } = useProjectBehaviours({
    projectId: project.id,
    dimension: "topic",
    segment,
    sortBy: "category",
    ...(timeRange ? { timeRange } : {}),
  })
  const topics = data?.topics ?? []
  const activeNode = useMemo(() => {
    if (!activeBehaviourId) return null
    const walk = (
      nodes: readonly BehaviourNodeRecord[],
      parent: BehaviourNodeRecord | null,
    ): { readonly node: BehaviourNodeRecord; readonly parent: BehaviourNodeRecord | null } | null => {
      for (const node of nodes) {
        if (node.cluster.id === activeBehaviourId) return { node, parent }
        const found = walk(node.children, node)
        if (found) return found
      }
      return null
    }
    return walk(topics, null)
  }, [activeBehaviourId, topics])
  const hasNoBehaviours = !isLoading && topics.length === 0 && segment === "all" && !timeRange

  if (hasNoBehaviours) {
    return (
      <Layout>
        <Layout.Content>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <TagsIcon className="h-8 w-8 text-muted-foreground" />
            <Text.H3>No behaviours yet</Text.H3>
            <Text.H5 color="foregroundMuted">
              Live taxonomy behaviours will appear here after sessions have been clustered.
            </Text.H5>
          </div>
        </Layout.Content>
      </Layout>
    )
  }

  return (
    <Layout>
      <Layout.Content>
        <BehavioursView
          topics={topics}
          projectId={project.id}
          isLoading={isLoading}
          segment={segment}
          activeBehaviourId={activeBehaviourId || undefined}
          timeFilter={
            <TimeFilterDropdown
              {...(timeFrom ? { startTimeFrom: timeFrom } : {})}
              {...(timeTo ? { startTimeTo: timeTo } : {})}
              onChange={(from, to) => {
                setTimeFrom(from ?? "")
                setTimeTo(to ?? "")
              }}
            />
          }
          timeRange={timeRange}
          onSegmentChange={setSegment}
          onActiveBehaviourChange={(behaviourId) => setActiveBehaviourId(behaviourId ?? "")}
        />
      </Layout.Content>
      {activeNode ? (
        <Layout.Aside>
          <BehaviourDetailDrawer
            node={activeNode.node}
            parentName={activeNode.parent?.cluster.name ?? null}
            projectId={project.id}
            timeRange={timeRange}
            onClose={() => setActiveBehaviourId("")}
          />
        </Layout.Aside>
      ) : null}
    </Layout>
  )
}

function FeatureFlagOffSplash() {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex max-w-lg flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
          <Icon icon={LockIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>Behaviours aren't available yet</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            This feature is rolling out gradually. Reach out to support if you'd like early access for your
            organization.
          </Text.H5>
        </div>
      </div>
    </div>
  )
}
