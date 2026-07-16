import { Button, Icon, Text } from "@repo/ui"
import { ClockIcon, ExternalLinkIcon, HourglassIcon, Loader2Icon, TagsIcon } from "lucide-react"
import { useMemo } from "react"
import { useAnalyticsTimeWindow } from "../../../../../../domains/projects/use-analytics-time-window.ts"
import { useCustomBehaviorPreview } from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import { type BehaviourSegment, useProjectBehaviours } from "../../../../../../domains/taxonomy/taxonomy.collection.ts"
import type { BehaviourMomentRangeRecord } from "../../../../../../domains/taxonomy/taxonomy.functions.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { TimeFilterDropdown } from "../../-components/time-filter-dropdown.tsx"
import type { useRouteProject } from "../../-route-data.ts"
import { findNodeById, findNodeByPath, isBehaviourTrajectoryMetric } from "./behaviour-tree-nav.ts"
import { type BehaviourFormIntent, BehavioursScopeHeader } from "./behaviours-scope-header.tsx"
import { BehaviourDetailDrawer, BehavioursView } from "./behaviours-view.tsx"

type RouteProject = ReturnType<typeof useRouteProject>

const isDemoProjectName = (name: string) => /(^|\b)demo project(\b|$)/i.test(name)

/**
 * Shown when a custom behavior has no tree yet. Under the auto-garden model this
 * is a normal steady state (a narrow filter matching < the observation
 * threshold), not a pre-Generate one — so it reads as "waiting for data", driven
 * by the live preview count, never a status badge or a red "failed".
 */
function ScopedTreeWaiting({ behaviour }: { readonly behaviour: CustomBehaviorRecord }) {
  const preview = useCustomBehaviorPreview(behaviour.projectId, behaviour.filterSet)
  const count = preview.data?.observationCount
  const threshold = preview.data?.minObservations

  // Not enough matching data yet — a normal steady state, driven by the preview.
  if (preview.data && !preview.data.isReady) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <Icon icon={HourglassIcon} size="lg" color="foregroundMuted" />
        <Text.H4>Waiting for matching sessions</Text.H4>
        <Text.H5 color="foregroundMuted" centered className="max-w-md">
          {`Found ${(count ?? 0).toLocaleString()} of ${threshold} matching sessions so far. `}
          This cohort's behaviors are built automatically once there are enough.
        </Text.H5>
      </div>
    )
  }

  // A gardening run is actually in flight right now — the only case a spinner is honest.
  if (behaviour.status === "generating") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        <Text.H4>Building this cohort</Text.H4>
        <Text.H5 color="foregroundMuted" centered className="max-w-md">
          Analyzing the matching sessions now. Its behaviors will appear here when they're ready.
        </Text.H5>
      </div>
    )
  }

  // Enough matching data, but no run in flight: it's picked up by the next
  // scheduled sweep, which can be hours away — no spinner, set that expectation.
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <Icon icon={ClockIcon} size="lg" color="foregroundMuted" />
      <Text.H4>Waiting for the next run</Text.H4>
      <Text.H5 color="foregroundMuted" centered className="max-w-md">
        {count !== undefined ? `${count.toLocaleString()} matching sessions found. ` : ""}
        This cohort's behaviors are built automatically on a schedule. They'll appear after the next run, which can take
        a few hours.
      </Text.H5>
    </div>
  )
}

function GlobalEmptyState({ isDemoProject }: { readonly isDemoProject: boolean }) {
  return (
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
        <Text.H5 color="foregroundMuted" centered className="max-w-md">
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
  )
}

/**
 * The single behaviours-tree page body, shared by the global route
 * (`/behaviours`) and every custom behavior (`/behaviours/$slug`). The two
 * differ only by `customBehaviour`: it scopes the read to that behavior's slice
 * and swaps the cold-start empty state for the waiting-for-data view. This is
 * the ONLY place the tree, the segment/time chrome, and the detail drawer are
 * wired — there is no second copy.
 */
export function BehavioursPage({
  project,
  customBehaviour,
  initialForm,
  onFormClose,
}: {
  readonly project: RouteProject
  readonly customBehaviour?: CustomBehaviorRecord
  /** Route-driven form to open on mount (deep-link / entry point). */
  readonly initialForm?: BehaviourFormIntent
  readonly onFormClose?: () => void
}) {
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
    ...(customBehaviour
      ? { customBehaviorId: customBehaviour.id, poll: customBehaviour.status === "generating" }
      : { pollUntilTopics: isDemoProject && segment === "all" && !timeRange }),
  })
  const topics = data?.topics ?? []

  const momentRange = useMemo((): BehaviourMomentRangeRecord | undefined => {
    if (!isBehaviourTrajectoryMetric(momentMetric)) return undefined
    const fromTurn = Number(momentTurnFrom)
    const toTurn = Number(momentTurnTo)
    if (!Number.isInteger(fromTurn) || !Number.isInteger(toTurn) || fromTurn < 0 || toTurn < fromTurn) return undefined
    return { metric: momentMetric, fromTurn, toTurn }
  }, [momentMetric, momentTurnFrom, momentTurnTo])
  const setMomentRangeWithMax = (range: BehaviourMomentRangeRecord | undefined, maxTurn?: number) => {
    setMomentMetric(range?.metric ?? "")
    setMomentTurnFrom(range ? String(range.fromTurn) : "")
    setMomentTurnTo(range ? String(range.toTurn) : "")
    setMomentTurnMax(range && maxTurn !== undefined ? String(Math.max(maxTurn, range.toTurn)) : "")
  }
  const parsedMomentTurnMax = Number(momentTurnMax)
  const momentRangeMaxTurn =
    momentRange && Number.isInteger(parsedMomentTurnMax) && parsedMomentTurnMax >= momentRange.toTurn
      ? parsedMomentTurnMax
      : (momentRange?.toTurn ?? 0)

  const behaviourPath = useMemo(
    () => (behaviourPathParam ? behaviourPathParam.split(".").filter(Boolean) : []),
    [behaviourPathParam],
  )
  const setBehaviourPath = (path: readonly string[]) => setBehaviourPathParam(path.join("."))
  const activeBehaviourId = behaviourPath.at(-1)
  const activeNode = useMemo(() => {
    if (!activeBehaviourId) return null
    return findNodeByPath(topics, behaviourPath) ?? findNodeById(topics, activeBehaviourId)
  }, [activeBehaviourId, behaviourPath, topics])

  // Full empty state only when unfiltered; a filtered-empty tree still renders
  // BehavioursView (its table shows "No behaviors match the current filters").
  const showFullEmpty = !isLoading && topics.length === 0 && segment === "all" && !timeRange

  return (
    <Layout>
      <Layout.Content>
        <BehavioursScopeHeader
          project={project}
          current={customBehaviour ?? null}
          {...(initialForm ? { initialForm } : {})}
          {...(onFormClose ? { onFormClose } : {})}
        />
        {showFullEmpty ? (
          customBehaviour ? (
            <ScopedTreeWaiting behaviour={customBehaviour} />
          ) : (
            <GlobalEmptyState isDemoProject={isDemoProject} />
          )
        ) : (
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
            momentRange={momentRange}
            {...(customBehaviour ? { customBehaviorId: customBehaviour.id } : {})}
            onSegmentChange={setSegment}
            onBehaviourPathChange={setBehaviourPath}
            onMomentRangeChange={setMomentRangeWithMax}
          />
        )}
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
            {...(customBehaviour ? { customBehaviorId: customBehaviour.id } : {})}
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
