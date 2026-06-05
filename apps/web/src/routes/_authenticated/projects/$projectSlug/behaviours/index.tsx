import { Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { TagsIcon } from "lucide-react"
import { useMemo } from "react"
import { type BehaviourSegment, useProjectBehaviours } from "../../../../../domains/taxonomy/taxonomy.collection.ts"
import type { BehaviourNodeRecord } from "../../../../../domains/taxonomy/taxonomy.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
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
  const project = useRouteProject()
  const [segment, setSegment] = useParamState("behaviourSegment", "all", {
    validate: (value): value is BehaviourSegment =>
      value === "all" || value === "new_this_week" || value === "spiking" || value === "high_escalation",
  })
  const [activeBehaviourId, setActiveBehaviourId] = useParamState("behaviourId", "")
  const { data, isLoading } = useProjectBehaviours({
    projectId: project.id,
    dimension: "topic",
    segment,
    sortBy: "category",
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
  const hasNoBehaviours = !isLoading && topics.length === 0 && segment === "all"

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
          isLoading={isLoading}
          segment={segment}
          activeBehaviourId={activeBehaviourId || undefined}
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
            onClose={() => setActiveBehaviourId("")}
          />
        </Layout.Aside>
      ) : null}
    </Layout>
  )
}
