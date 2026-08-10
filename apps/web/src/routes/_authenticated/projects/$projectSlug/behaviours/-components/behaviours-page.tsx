import { customBehaviorFilterSetHasConditions, TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS } from "@domain/taxonomy"
import { Alert, Button, cn, Icon, Modal, Text, Tooltip, useToast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { ClockIcon, HourglassIcon, InfoIcon, Loader2Icon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { TimeFilterDropdown } from "../../../../../../components/time-filter-dropdown.tsx"
import { useAnalyticsTimeWindow } from "../../../../../../domains/projects/use-analytics-time-window.ts"
import { useCustomBehaviorPreview } from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import {
  useFacetAnswers,
  useFacetExtractionProgress,
  useFacetsList,
  useInvalidateBehaviorQueries,
  useStopBehavior,
} from "../../../../../../domains/taxonomy/facets.collection.ts"
import { type BehaviourSegment, useProjectBehaviours } from "../../../../../../domains/taxonomy/taxonomy.collection.ts"
import type { BehaviourMomentRangeRecord } from "../../../../../../domains/taxonomy/taxonomy.functions.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { SessionDetailDrawer } from "../../-components/session-detail-drawer.tsx"
import type { useRouteProject } from "../../-route-data.ts"
import { type BehaviourScope, scopeTreeBehaviour } from "./behaviour-scope.ts"
import { findNodeById, findNodeByPath, isBehaviourTrajectoryMetric } from "./behaviour-tree-nav.ts"
import { GlobalEmptyState, isDemoProject } from "./behaviours-empty-state.tsx"
import { type BehaviourFormIntent, BehavioursScopeHeader } from "./behaviours-scope-header.tsx"
import { BehaviourDetailDrawer, BehavioursView } from "./behaviours-view.tsx"
import { RefineBehaviorModal } from "./refine-behavior-modal.tsx"

type RouteProject = ReturnType<typeof useRouteProject>

/**
 * Shown when a scoped view has no tree yet. Under the auto-garden model this is a
 * normal steady state (not enough sessions in the gardening window), not a
 * pre-Generate one, so it reads as "waiting for data", driven by the live
 * preview count, never a status badge or a red "failed". Copy adapts to the view:
 * a facet behavior is "analyzed", a topic behavior is "built"; a whole-project
 * behavior (no filter) counts recent sessions rather than "matching" ones.
 */
function ScopedTreeWaiting({ behaviour }: { readonly behaviour: CustomBehaviorRecord }) {
  const preview = useCustomBehaviorPreview(behaviour.projectId, behaviour.filterSet)
  const count = preview.data?.observationCount
  const threshold = preview.data?.minObservations
  const isFacetBehavior = behaviour.facetId !== null
  const hasFilter = customBehaviorFilterSetHasConditions(behaviour.filterSet)
  // A whole-project behavior has no filter, so the count is recent sessions in the
  // gardening window, not "matching" ones.
  const sessionsLabel = hasFilter
    ? "matching sessions"
    : `sessions in the last ${TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS} days`
  const scheduleLine = "The groups are built automatically once there are enough sessions."

  // Not enough data yet: a normal steady state, driven by the preview.
  if (preview.data && !preview.data.isReady) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <Icon icon={HourglassIcon} size="lg" color="foregroundMuted" />
        <Text.H4>{hasFilter ? "Waiting for matching sessions" : "Waiting for recent sessions"}</Text.H4>
        <Text.H5 color="foregroundMuted" centered className="max-w-md">
          {`Found ${(count ?? 0).toLocaleString()} of ${threshold} ${sessionsLabel} so far. `}
          {scheduleLine}
        </Text.H5>
      </div>
    )
  }

  // A gardening run is actually in flight right now — the only case a spinner is honest.
  if (behaviour.status === "generating") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <Icon icon={Loader2Icon} size="md" color="foregroundMuted" className="animate-spin" />
        <Text.H4>{isFacetBehavior ? "Analyzing sessions through this behavior" : "Building this behavior"}</Text.H4>
        <Text.H5 color="foregroundMuted" centered className="max-w-md">
          {isFacetBehavior
            ? "We're analyzing your sessions through this behavior. The groups appear here as soon as they're ready."
            : "We're analyzing the matching sessions. The groups appear here as soon as they're ready."}
        </Text.H5>
      </div>
    )
  }

  // Enough data, but no run in flight: it's picked up by the next scheduled
  // sweep, which can be hours away, so it shows no spinner and sets that expectation.
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <Icon icon={ClockIcon} size="lg" color="foregroundMuted" />
      <Text.H4>Waiting for the next run</Text.H4>
      <Text.H5 color="foregroundMuted" centered className="max-w-md">
        {count !== undefined ? `${count.toLocaleString()} ${sessionsLabel} found. ` : ""}
        The groups are built on a schedule, so they appear after the next run, which can take a few hours.
      </Text.H5>
    </div>
  )
}

function HealthStat({
  label,
  value,
  sub,
  color,
}: {
  readonly label: string
  readonly value: string
  readonly sub?: string
  readonly color: "success" | "primary" | "warningMutedForeground"
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 text-center">
      <Text.H6 color="foregroundMuted" uppercase>
        {label}
      </Text.H6>
      <Text.H2 color={color} weight="bold">
        {value}
      </Text.H2>
      {sub ? <Text.H6 color="foregroundMuted">{sub}</Text.H6> : null}
    </div>
  )
}

/**
 * A read on behavior quality while it gardens: the share of sessions that produced a
 * usable answer, how varied those answers are, and the unclear rate. A high
 * unclear rate or a collapsed (near-single) answer set means the instructions
 * aren't discriminating. Surface that as a hint so the user can refine early
 * instead of waiting for a useless tree.
 */
function BehaviorHealthOverview({
  extracted,
  clear,
  unclear,
  distinctAnswers,
}: {
  readonly extracted: number
  readonly clear: number
  readonly unclear: number
  readonly distinctAnswers: number
}) {
  const clearPct = extracted > 0 ? Math.round((clear / extracted) * 100) : 0
  const unclearPct = extracted > 0 ? Math.round((unclear / extracted) * 100) : 0
  const hint =
    extracted >= 10 && unclear / extracted > 0.4
      ? "Many sessions came back unclear. The instructions may be too specific, or these conversations don't carry the answer."
      : clear >= 10 && distinctAnswers <= 2
        ? "Almost every session maps to the same answer. This behavior may be too broad to separate sessions."
        : null
  return (
    <div className="flex w-full max-w-xl flex-col gap-4 rounded-lg border border-border p-5">
      <div className="flex flex-row items-center justify-center gap-1.5">
        <Text.H4M>How this behavior is doing</Text.H4M>
        <Tooltip asChild trigger={<Icon icon={InfoIcon} size="sm" color="foregroundMuted" />}>
          <div className="flex max-w-xs flex-col gap-1.5">
            <span>Clear answers: the share of analyzed sessions the behavior pulled a usable answer from.</span>
            <span>
              Unique answers: how many different answers those are. A low number means the behavior barely separates
              sessions.
            </span>
            <span>Unclear: the share where the behavior could not find an answer in the conversation.</span>
          </div>
        </Tooltip>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border">
        <HealthStat
          label="Clear answers"
          value={`${clearPct}%`}
          sub={`${clear.toLocaleString()} of ${extracted.toLocaleString()}`}
          color="success"
        />
        <HealthStat label="Unique answers" value={distinctAnswers.toLocaleString()} color="primary" />
        <HealthStat
          label="Unclear"
          value={`${unclearPct}%`}
          sub={unclear.toLocaleString()}
          color="warningMutedForeground"
        />
      </div>
      {hint ? <Alert variant="warning" description={hint} /> : null}
    </div>
  )
}

/**
 * Cold-start view for a behavior whose tree is still gardening: instead of a bare
 * spinner, show the extraction streaming in: a health read on the answers plus
 * the answers themselves, so the ~one-time-per-behavior wait is legible and the user
 * can judge (and refine) the behavior before the tree lands. Falls back to the plain
 * waiting state when there's no run in flight and nothing extracted yet.
 */
function BehaviorColdStartProgress({
  project,
  behaviour,
  onOpenSession,
  selectedSessionId,
}: {
  readonly project: RouteProject
  readonly behaviour: CustomBehaviorRecord
  readonly onOpenSession: (sessionId: string) => void
  readonly selectedSessionId: string
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const generating = behaviour.status === "generating"
  const preview = useCustomBehaviorPreview(behaviour.projectId, behaviour.filterSet)
  const progress = useFacetExtractionProgress(behaviour.projectId, behaviour.facetId, { enabled: generating })
  const answersQuery = useFacetAnswers(behaviour.projectId, behaviour.facetId, { enabled: generating })
  const { data: facets } = useFacetsList(behaviour.projectId)
  const stopBehavior = useStopBehavior()
  const invalidateBehaviorQueries = useInvalidateBehaviorQueries(behaviour.projectId)
  const [action, setAction] = useState<"stop" | "refine" | null>(null)
  const target = preview.data?.sessionCount
  const extracted = progress.data?.extractedCount ?? 0
  const clear = progress.data?.clearCount ?? 0
  const distinctAnswers = progress.data?.distinctAnswers ?? 0
  const unclear = Math.max(0, extracted - clear)
  const facet = facets.find((entry) => entry.id === behaviour.facetId)
  // Live inserts shift offset-based page edges, so a session can land on two
  // pages across refetches, so dedupe by id, keeping newest-first order.
  const answers = useMemo(() => {
    const seen = new Set<string>()
    const out: { sessionId: string; text: string }[] = []
    for (const page of answersQuery.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.sessionId)) continue
        seen.add(item.sessionId)
        out.push(item)
      }
    }
    return out
  }, [answersQuery.data])

  if (!generating && extracted === 0) return <ScopedTreeWaiting behaviour={behaviour} />

  const confirmStop = async () => {
    try {
      await stopBehavior.mutateAsync({ customBehaviorId: behaviour.id })
      setAction(null)
      toast({ description: "Behavior stopped and removed." })
      // Leave the now-deleted view's route BEFORE invalidating, so it never
      // resolves to "not found".
      await navigate({ to: "/projects/$projectSlug/behaviours", params: { projectSlug: project.slug } })
      invalidateBehaviorQueries()
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  const pct = target && target > 0 ? Math.min(100, Math.round((extracted / target) * 100)) : null
  // A behavior re-created on a facet that was already extracted (its answers are
  // cached and reused) jumps straight to clustering. Nothing is being read, so
  // don't claim it is.
  const cached = target !== undefined && target > 0 && extracted >= target
  return (
    <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto p-8">
      <div className="flex w-full max-w-xl flex-col gap-3">
        <div className="flex flex-row items-center gap-2">
          <Icon icon={Loader2Icon} color="foregroundMuted" className="animate-spin" />
          <Text.H4>{cached ? "Grouping your sessions" : "Analyzing your sessions through this behavior"}</Text.H4>
        </div>
        <Text.H5 color="foregroundMuted">
          {cached
            ? `All ${extracted.toLocaleString()} sessions are already analyzed for this behavior. We're building the groups now, and they appear as soon as they're ready.`
            : `Analyzed ${extracted.toLocaleString()}${target ? ` of ~${target.toLocaleString()}` : ""} sessions. A new behavior is analyzed once, then the groups appear as soon as they're ready.`}
        </Text.H5>
        {pct !== null && !cached ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        <div className="flex flex-row items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAction("refine")} disabled={!facet}>
            Refine instructions
          </Button>
          <Button size="sm" variant="destructive-soft" onClick={() => setAction("stop")}>
            Stop behavior
          </Button>
        </div>
      </div>
      {extracted > 0 ? (
        <BehaviorHealthOverview
          extracted={extracted}
          clear={clear}
          unclear={unclear}
          distinctAnswers={distinctAnswers}
        />
      ) : null}
      {answers.length > 0 ? (
        <div className="flex w-full max-w-xl flex-col gap-1.5">
          <Text.H6 color="foregroundMuted">Extracted answers (click one to open its session)</Text.H6>
          <div className="flex flex-col gap-1">
            {answers.map((answer) => (
              <button
                type="button"
                key={answer.sessionId}
                onClick={() => onOpenSession(answer.sessionId)}
                className={cn(
                  "flex flex-row items-center rounded-md px-3 py-1.5 text-left transition-colors",
                  answer.sessionId === selectedSessionId
                    ? "bg-primary-muted ring-1 ring-primary/40"
                    : "bg-muted hover:bg-muted-foreground/15",
                )}
              >
                <Text.H6>{answer.text}</Text.H6>
              </button>
            ))}
          </div>
          {answersQuery.hasNextPage ? (
            <Button
              variant="ghost"
              size="sm"
              className="self-center"
              onClick={() => void answersQuery.fetchNextPage()}
              disabled={answersQuery.isFetchingNextPage}
            >
              {answersQuery.isFetchingNextPage ? <Icon icon={Loader2Icon} size="sm" className="animate-spin" /> : null}
              Show more
            </Button>
          ) : null}
        </div>
      ) : null}
      {action === "stop" ? (
        <Modal
          open
          dismissible
          size="regular"
          onOpenChange={(next) => (next || stopBehavior.isPending ? undefined : setAction(null))}
          title="Stop this behavior?"
          description="This stops the analysis and removes the behavior. The answers extracted so far are discarded. You can create it again later."
          footer={
            <div className="flex w-full flex-row justify-between gap-2">
              <Button variant="outline" onClick={() => setAction(null)} disabled={stopBehavior.isPending}>
                Keep analyzing
              </Button>
              <Button variant="destructive" onClick={() => void confirmStop()} disabled={stopBehavior.isPending}>
                {stopBehavior.isPending ? <Icon icon={Loader2Icon} size="sm" className="animate-spin" /> : null}
                Stop and remove
              </Button>
            </div>
          }
        >
          <Alert
            variant="destructive"
            description="Stopping is permanent for the work done so far. The extracted answers can't be recovered."
          />
        </Modal>
      ) : null}
      {action === "refine" && facet ? (
        <RefineBehaviorModal
          project={project}
          customBehaviorId={behaviour.id}
          initialDraft={{ name: facet.name, description: facet.description, instructions: facet.instructions }}
          onClose={() => setAction(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * The single behaviours-tree page body, shared by the legacy global screen, the
 * topic behavior, every facet behavior, and every view. They differ only by
 * `customBehaviour` — it scopes the read to that slice and picks the empty state —
 * and by the `header` above the tree. This is the ONLY place the tree, the
 * segment/time chrome, and the detail drawer are wired.
 */
export function BehavioursTreeBody({
  project,
  customBehaviour,
  header,
}: {
  readonly project: RouteProject
  /** null = the whole-project topic tree (the online-routed one). */
  readonly customBehaviour: CustomBehaviorRecord | null
  readonly header?: ReactNode
}) {
  const [segment, setSegment] = useParamState("behaviourSegment", "all", {
    validate: (value): value is BehaviourSegment =>
      value === "all" || value === "new_this_week" || value === "spiking" || value === "high_escalation",
  })
  const [behaviourPathParam, setBehaviourPathParam] = useParamState("behaviourPath", "", { history: "push" })
  const [coldStartSessionId, setColdStartSessionId] = useState("")
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

  const demoProject = isDemoProject(project)
  const { data, isLoading } = useProjectBehaviours({
    projectId: project.id,
    dimension: "topic",
    segment,
    sortBy: "category",
    ...(timeRange ? { timeRange } : {}),
    ...(customBehaviour
      ? {
          customBehaviorId: customBehaviour.id,
          ...(customBehaviour.facetId ? { facetId: customBehaviour.facetId } : {}),
          poll: customBehaviour.status === "generating",
        }
      : { pollUntilTopics: demoProject && segment === "all" && !timeRange }),
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
        {header}
        {showFullEmpty ? (
          customBehaviour ? (
            customBehaviour.facetId && !customBehaviorFilterSetHasConditions(customBehaviour.filterSet) ? (
              <BehaviorColdStartProgress
                project={project}
                behaviour={customBehaviour}
                onOpenSession={setColdStartSessionId}
                selectedSessionId={coldStartSessionId}
              />
            ) : (
              <ScopedTreeWaiting behaviour={customBehaviour} />
            )
          ) : (
            <GlobalEmptyState isDemoProject={demoProject} />
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
            {...(customBehaviour?.facetId ? { facetId: customBehaviour.facetId } : {})}
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
            {...(customBehaviour?.facetId ? { facetId: customBehaviour.facetId } : {})}
            onMomentRangeChange={setMomentRangeWithMax}
            onClose={() => {
              setBehaviourPath([])
              setMomentRangeWithMax(undefined)
            }}
          />
        </Layout.Aside>
      ) : coldStartSessionId ? (
        <Layout.Aside>
          <SessionDetailDrawer
            key={coldStartSessionId}
            projectId={project.id}
            sessionId={coldStartSessionId}
            onClose={() => setColdStartSessionId("")}
          />
        </Layout.Aside>
      ) : null}
    </Layout>
  )
}

/**
 * A behavior's page: its tree, under a header naming the behavior and listing its
 * views. Serves the topic behavior, every facet behavior, and every view — the
 * scope decides which slice the tree reads.
 */
export function BehavioursPage({
  project,
  scope,
  initialForm,
  onFormClose,
}: {
  readonly project: RouteProject
  readonly scope: BehaviourScope
  /** Route-driven form to open on mount (deep-link / entry point). */
  readonly initialForm?: BehaviourFormIntent
  readonly onFormClose?: () => void
}) {
  return (
    <BehavioursTreeBody
      project={project}
      customBehaviour={scopeTreeBehaviour(scope)}
      header={
        <BehavioursScopeHeader
          project={project}
          scope={scope}
          {...(initialForm ? { initialForm } : {})}
          {...(onFormClose ? { onFormClose } : {})}
        />
      }
    />
  )
}
