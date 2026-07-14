import { Button, Icon, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { ExternalLinkIcon, Loader2Icon, TagsIcon } from "lucide-react"
import { useMemo } from "react"
import { useAnalyticsTimeWindow } from "../../../../../domains/projects/use-analytics-time-window.ts"
import { type BehaviourSegment, useProjectBehaviours } from "../../../../../domains/taxonomy/taxonomy.collection.ts"
import type { BehaviourMomentRangeRecord } from "../../../../../domains/taxonomy/taxonomy.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { useRouteProject } from "../-route-data.ts"
import { findNodeById, findNodeByPath, isBehaviourTrajectoryMetric } from "./-components/behaviour-tree-nav.ts"
import { BehaviourDetailDrawer, BehavioursView } from "./-components/behaviours-view.tsx"

const isDemoProjectName = (name: string) => /(^|\b)demo project(\b|$)/i.test(name)

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
  const tw = useAnalyticsTimeWindow({ project, fromKey: "behaviourTimeFrom", toKey: "behaviourTimeTo" })
  const [momentMetric, setMomentMetric] = useParamState("behaviourMomentMetric", "")
  const [momentTurnFrom, setMomentTurnFrom] = useParamState("behaviourMomentTurnFrom", "")
  const [momentTurnTo, setMomentTurnTo] = useParamState("behaviourMomentTurnTo", "")
  const [momentTurnMax, setMomentTurnMax] = useParamState("behaviourMomentTurnMax", "")
  const timeRange = useMemo(
    () =>
      tw.isAllTime
        ? undefined
        : {
            ...(tw.listRange.fromIso ? { fromIso: tw.listRange.fromIso } : {}),
            toIso: tw.listRange.toIso,
          },
    [tw.isAllTime, tw.listRange],
  )
  const isDemoProject = project.settings.isSample || isDemoProjectName(project.name)
  const { data, isLoading } = useProjectBehaviours({
    projectId: project.id,
    dimension: "topic",
    segment,
    sortBy: "category",
    ...(timeRange ? { timeRange } : {}),
    pollUntilTopics: isDemoProject && segment === "all" && !timeRange,
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
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
              {isDemoProject ? (
                <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <TagsIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col items-center gap-2">
              <Text.H3>{isDemoProject ? "Sample behaviors are loading" : "No behaviors yet"}</Text.H3>
              <Text.H5 color="foregroundMuted" centered>
                {isDemoProject
                  ? "We found the sample traces and signals. The behavior taxonomy is still being prepared — check back in about a minute."
                  : "Live taxonomy behaviors will appear here after sessions have been clustered."}
              </Text.H5>
            </div>
            {isDemoProject ? null : (
              <a href="https://docs.latitude.so/search/behaviours" target="_blank" rel="noopener noreferrer">
                <Button>
                  <Icon size="sm" icon={ExternalLinkIcon} />
                  Read the docs
                </Button>
              </a>
            )}
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
              {...(tw.pickerStartFrom ? { startTimeFrom: tw.pickerStartFrom } : {})}
              {...(tw.pickerStartTo ? { startTimeTo: tw.pickerStartTo } : {})}
              onChange={tw.onTimeChange}
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
