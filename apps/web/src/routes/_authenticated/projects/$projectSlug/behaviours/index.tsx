import { Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { TagsIcon } from "lucide-react"
import { useMemo } from "react"
import { type BehaviourSegment, useProjectBehaviours } from "../../../../../domains/taxonomy/taxonomy.collection.ts"
import type {
  BehaviourMomentRangeRecord,
  BehaviourNodeRecord,
  BehaviourTrajectoryMetric,
} from "../../../../../domains/taxonomy/taxonomy.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { useRouteProject } from "../-route-data.ts"
import { BehaviourDetailDrawer, BehavioursView } from "./-components/behaviours-view.tsx"

const isBehaviourTrajectoryMetric = (value: string): value is BehaviourTrajectoryMetric =>
  value === "frequency" || value === "escalation" || value === "resolution" || value === "churnRisk" || value === "wins"

const findNodeByPath = (
  topics: readonly BehaviourNodeRecord[],
  path: readonly string[],
): { readonly node: BehaviourNodeRecord; readonly parent: BehaviourNodeRecord | null } | null => {
  let nodes = topics
  let parent: BehaviourNodeRecord | null = null
  let selected: { readonly node: BehaviourNodeRecord; readonly parent: BehaviourNodeRecord | null } | null = null
  for (const id of path) {
    const node = nodes.find((candidate) => candidate.cluster.id === id)
    if (!node) return null
    selected = { node, parent }
    nodes = node.children
    parent = node
  }
  return selected
}

const findNodeById = (
  nodes: readonly BehaviourNodeRecord[],
  clusterId: string,
  parent: BehaviourNodeRecord | null = null,
): { readonly node: BehaviourNodeRecord; readonly parent: BehaviourNodeRecord | null } | null => {
  for (const node of nodes) {
    if (node.cluster.id === clusterId) return { node, parent }
    const found = findNodeById(node.children, clusterId, node)
    if (found) return found
  }
  return null
}

function BehavioursBreadcrumb() {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TagsIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <BreadcrumbText variant="current">Behaviors</BreadcrumbText>
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
  return <BehavioursPageContent />
}

function BehavioursPageContent() {
  const project = useRouteProject()
  const [segment, setSegment] = useParamState("behaviourSegment", "all", {
    validate: (value): value is BehaviourSegment =>
      value === "all" || value === "new_this_week" || value === "spiking" || value === "high_escalation",
  })
  const [behaviourPathParam, setBehaviourPathParam] = useParamState("behaviourPath", "", { history: "push" })
  const [timeFrom, setTimeFrom] = useParamState("behaviourTimeFrom", "")
  const [timeTo, setTimeTo] = useParamState("behaviourTimeTo", "")
  const [momentMetric, setMomentMetric] = useParamState("behaviourMomentMetric", "")
  const [momentTurnFrom, setMomentTurnFrom] = useParamState("behaviourMomentTurnFrom", "")
  const [momentTurnTo, setMomentTurnTo] = useParamState("behaviourMomentTurnTo", "")
  const [momentTurnMax, setMomentTurnMax] = useParamState("behaviourMomentTurnMax", "")
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
  const momentRange = useMemo((): BehaviourMomentRangeRecord | undefined => {
    if (!isBehaviourTrajectoryMetric(momentMetric)) return undefined
    const fromTurn = Number(momentTurnFrom)
    const toTurn = Number(momentTurnTo)
    if (!Number.isInteger(fromTurn) || !Number.isInteger(toTurn) || fromTurn < 0 || toTurn < fromTurn) return undefined
    return { metric: momentMetric, fromTurn, toTurn }
  }, [momentMetric, momentTurnFrom, momentTurnTo])
  const setMomentRange = (range: BehaviourMomentRangeRecord | undefined) => {
    setMomentMetric(range?.metric ?? "")
    setMomentTurnFrom(range ? String(range.fromTurn) : "")
    setMomentTurnTo(range ? String(range.toTurn) : "")
  }
  const parsedMomentTurnMax = Number(momentTurnMax)
  const momentRangeMaxTurn =
    momentRange && Number.isInteger(parsedMomentTurnMax) && parsedMomentTurnMax >= momentRange.toTurn
      ? parsedMomentTurnMax
      : (momentRange?.toTurn ?? 0)
  const setMomentRangeWithMax = (range: BehaviourMomentRangeRecord | undefined, maxTurn?: number) => {
    setMomentRange(range)
    setMomentTurnMax(range && maxTurn !== undefined ? String(Math.max(maxTurn, range.toTurn)) : "")
  }
  const topics = data?.topics ?? []
  const behaviourPath = useMemo(
    () => (behaviourPathParam ? behaviourPathParam.split(".").filter(Boolean) : []),
    [behaviourPathParam],
  )
  const activeBehaviourId = behaviourPath.at(-1)
  const activeNode = useMemo(() => {
    if (!activeBehaviourId) return null
    return findNodeByPath(topics, behaviourPath) ?? findNodeById(topics, activeBehaviourId)
  }, [activeBehaviourId, behaviourPath, topics])
  const setBehaviourPath = (path: readonly string[]) => setBehaviourPathParam(path.join("."))
  const hasNoBehaviours = !isLoading && topics.length === 0 && segment === "all" && !timeRange

  if (hasNoBehaviours) {
    return (
      <Layout>
        <Layout.Content>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <TagsIcon className="h-8 w-8 text-muted-foreground" />
            <Text.H3>No behaviors yet</Text.H3>
            <Text.H5 color="foregroundMuted">
              Live taxonomy behaviors will appear here after sessions have been clustered.
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
          behaviourPath={behaviourPath}
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
          onBehaviourPathChange={setBehaviourPath}
          momentRange={momentRange}
          onMomentRangeChange={setMomentRangeWithMax}
        />
      </Layout.Content>
      {activeNode ? (
        <Layout.Aside>
          <BehaviourDetailDrawer
            node={activeNode.node}
            parentName={activeNode.parent?.cluster.name ?? null}
            projectId={project.id}
            timeRange={timeRange}
            momentRange={momentRange}
            momentRangeMaxTurn={momentRangeMaxTurn}
            onMomentRangeChange={setMomentRangeWithMax}
            onClose={() => {
              setBehaviourPath([])
              setMomentRangeWithMax(undefined)
            }}
          />
        </Layout.Aside>
      ) : null}
    </Layout>
  )
}
