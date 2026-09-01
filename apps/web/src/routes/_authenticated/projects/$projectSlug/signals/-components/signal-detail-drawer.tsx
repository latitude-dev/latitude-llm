import {
  Button,
  CopyableText,
  DetailSection,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  Sheet,
  Skeleton,
  Status,
  TagList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, relativeTime } from "@repo/utils"
import { ArrowDownRightIcon, CheckIcon, DatabaseIcon, TextAlignStartIcon } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { useProjectAlertIncidentsInRange } from "../../../../../../domains/alerts/alerts.collection.ts"
import { useShowIncidentsOverlay } from "../../../../../../domains/alerts/use-show-incidents-overlay.ts"
import {
  addTracesToDatasetFunction,
  createDatasetFromTracesFunction,
} from "../../../../../../domains/datasets/datasets.functions.ts"
import type { SessionRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import {
  useSignalDetail,
  useSignalSessionsCount,
  useSignalSessionsInfiniteScroll,
} from "../../../../../../domains/signals/signals.collection.ts"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import {
  type BulkSelection,
  EMPTY_SELECTION,
  type SelectionState,
  useSelectableRows,
} from "../../../../../../lib/hooks/useSelectableRows.ts"
import { AddToDatasetModal } from "../../-components/add-to-dataset-modal.tsx"
import { SessionDetailDrawer, useSessionPanelParamReset } from "../../-components/session-detail-drawer.tsx"
import { SignalDrawerEvaluations } from "./signal-drawer-evaluations.tsx"
import { formatSeenAgeParts, formatSignalAgeAgoLabel } from "./signal-formatters.ts"
import { SignalLifecycleStatuses } from "./signal-lifecycle-statuses.tsx"
import { SignalTrendBar } from "./signal-trend-bar.tsx"

/**
 * Shared fixed height for the page's side-by-side Trend + Patterns panels, so
 * the two always line up; each scrolls internally if its content is taller.
 */
const SIGNAL_PAGE_PANEL_HEIGHT = "h-72"
/** Trend chart height inside that panel (leaves room for the panel header + padding). */
const SIGNAL_PAGE_TREND_CHART_HEIGHT = 200

/**
 * Which session the Sessions sheet shows. URL-synced on the full-page signal
 * view so a row is sharable; local state inside the session panel's issue slot,
 * where `sessionId` already belongs to the panel one level up.
 */
function useSignalSessionSheetId(urlSynced: boolean) {
  const [param, setParam] = useParamState("sessionId", "")
  const [local, setLocal] = useState("")
  return urlSynced ? ([param, setParam] as const) : ([local, setLocal] as const)
}

function SummaryField({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-0.5">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {value}
    </div>
  )
}

function SeenAtSummaryValue({
  lastSeenAtIso,
  firstSeenAtIso,
}: {
  readonly lastSeenAtIso: string | null
  readonly firstSeenAtIso: string | null
}) {
  const { lastSeenLabel, firstSeenLabel } = formatSeenAgeParts(lastSeenAtIso, firstSeenAtIso)

  // Flex `div` not `Text`: `Text`'s `display:inline` collapses the `gap-*` around the separator. Bare `<span>` triggers so Radix's hover handlers land on a real DOM node.
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-sm leading-5">
      {lastSeenAtIso ? (
        <Tooltip asChild trigger={<span className="break-words">{lastSeenLabel}</span>}>
          <div className="flex flex-col gap-0.5">
            <Text.H6 color="foregroundMuted">Last seen at</Text.H6>
            <Text.H6B>{new Date(lastSeenAtIso).toLocaleString()}</Text.H6B>
          </div>
        </Tooltip>
      ) : (
        <span className="break-words">{lastSeenLabel}</span>
      )}
      <span className="shrink-0 text-muted-foreground">/</span>
      {firstSeenAtIso ? (
        <Tooltip asChild trigger={<span className="break-words">{firstSeenLabel}</span>}>
          <div className="flex flex-col gap-0.5">
            <Text.H6 color="foregroundMuted">First seen at</Text.H6>
            <Text.H6B>{new Date(firstSeenAtIso).toLocaleString()}</Text.H6B>
          </div>
        </Tooltip>
      ) : (
        <span className="break-words">{firstSeenLabel}</span>
      )}
    </div>
  )
}

function SignalLifecycleTimestampSummaryValue({
  tooltipHeading,
  iso,
}: {
  readonly tooltipHeading: string
  readonly iso: string
}) {
  const label = formatSignalAgeAgoLabel(iso)

  return (
    <Text.H5 color="foreground" className="flex min-w-0 flex-wrap items-center gap-1">
      <Tooltip asChild trigger={<span className="break-words">{label}</span>}>
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted">{tooltipHeading}</Text.H6>
          <Text.H6B>{new Date(iso).toLocaleString()}</Text.H6B>
        </div>
      </Tooltip>
    </Text.H5>
  )
}

/**
 * Signal detail surface minus the `DetailDrawer` chrome (close, next/prev nav).
 *
 * Owns which trace is showing in the side `Sheet` so the standalone drawer
 * and the session-panel issue slot share the same "click trace → sliding
 * panel on top" behavior — Escape closes the sheet back to the issue, never
 * to whatever the parent panel would do next (the `Sheet` captures Escape
 * with `stopImmediatePropagation`).
 *
 * `onOverlayActiveChange` lets the parent observe sheet open/close — used by
 * the standalone drawer to disable its next/previous-issue arrows while a
 * trace is showing.
 */
export function SignalDetailBody({
  projectId,
  signalId,
  onOverlayActiveChange,
  variant = "drawer",
  prepend,
  trendAside,
  beforeTraces,
  append,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly onOverlayActiveChange?: (active: boolean) => void
  /**
   * `drawer` (default) renders the identity header + summary fields above the
   * scrollable sections. `page` omits both — the full-page Signal view renders
   * its own header and summary — and `prepend` lets the page drop extra
   * sections (e.g. Patterns) into the same scroll area.
   */
  readonly variant?: "drawer" | "page"
  readonly prepend?: ReactNode
  /**
   * Rendered (page variant) beside the Trend at a shared fixed height (e.g.
   * Patterns), so the wide histogram and the narrow list sit on one row.
   */
  readonly trendAside?: ReactNode
  /** Rendered in the scroll area just before the Traces section (e.g. Examples). */
  readonly beforeTraces?: ReactNode
  /** Rendered at the end of the scroll area, after the Traces section (e.g. Related issues). */
  readonly append?: ReactNode
}) {
  const { data: issue, isLoading } = useSignalDetail({ projectId, signalId })
  const {
    data: sessions,
    isLoading: sessionsLoading,
    infiniteScroll,
  } = useSignalSessionsInfiniteScroll({
    projectId,
    signalId,
    enabled: issue !== null,
  })
  const totalSessionCount = useSignalSessionsCount({ projectId, signalId, enabled: issue !== null })
  // Only the full-page view owns the URL; the drawer variant's params live one level up.
  const urlSyncedSessionSheet = variant === "page"
  const [sessionSheetSessionId, setSessionSheetSessionId] = useSignalSessionSheetId(urlSyncedSessionSheet)
  const [sessionSheetOpen, setSessionSheetOpen] = useState(() => sessionSheetSessionId.length > 0)
  const resetPanelParams = useSessionPanelParamReset()
  // Nested, clearing `signalId` would close the very slot we render in, so only the URL-owning page resets.
  const resetSessionPanelParams = () => {
    if (urlSyncedSessionSheet) resetPanelParams()
  }
  const sessionsSectionRef = useRef<HTMLDivElement>(null)
  // Captured at mount so opening a row later never re-triggers the deep-link scroll.
  const [deepLinkedSessionId] = useState(() => sessionSheetSessionId)
  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)

  useEffect(() => {
    setSelectionState(EMPTY_SELECTION)
  }, [signalId])

  // TODO(frontend-use-effect-policy): follows the param so history navigation can't leave an empty sheet open.
  useEffect(() => {
    const open = sessionSheetSessionId.length > 0
    setSessionSheetOpen(open)
    onOverlayActiveChange?.(open)
  }, [sessionSheetSessionId, onOverlayActiveChange])

  const scrolledToDeepLinkRef = useRef(false)
  // TODO(frontend-use-effect-policy): the section can only be scrolled to once the sessions query resolves.
  useEffect(() => {
    if (deepLinkedSessionId.length === 0 || scrolledToDeepLinkRef.current || sessionsLoading) return
    scrolledToDeepLinkRef.current = true
    sessionsSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }, [deepLinkedSessionId, sessionsLoading])

  const sessionIds = useMemo(() => sessions.map((session) => session.sessionId), [sessions])
  const sessionSelection = useSelectableRows<string>({
    rowIds: sessionIds,
    totalRowCount: totalSessionCount,
    controlledState: selectionState,
    onStateChange: setSelectionState,
  })
  // A signal session selection becomes the trace ids of its sessions: "selected"
  // / "allExcept" expand each loaded session to all its trace ids; "all" defers
  // to the signal scope so the server resolves every trace linked to the signal.
  const datasetSelection = useMemo<BulkSelection<string> | null>(() => {
    const selection = sessionSelection.bulkSelection
    if (!selection) return null
    if (selection.mode === "all") return selection
    const tracesBySession = new Map<string, readonly string[]>(
      sessions.map((session) => [session.sessionId, session.traceIds]),
    )
    const traceIds = selection.rowIds.flatMap((id) => [...(tracesBySession.get(id) ?? [])])
    return { mode: selection.mode, rowIds: traceIds }
  }, [sessionSelection.bulkSelection, sessions])

  // Window the incident query to the same range that the trend chart paints. Bucket keys are
  // ISO timestamps now (12h-aligned), and `trendBucketSeconds` tells us the cell width so we can
  // include the full last bucket in the upper bound. Falls back to an empty window when the
  // issue hasn't loaded — the hook short-circuits via `enabled`.
  const trendIncidentRange = useMemo(() => {
    const trend = issue?.trend
    if (!trend || trend.length === 0) return null
    const firstBucket = trend[0]
    const lastBucket = trend[trend.length - 1]
    if (!firstBucket || !lastBucket) return null
    const bucketWidthMs = (issue?.trendBucketSeconds ?? 24 * 60 * 60) * 1000
    return {
      fromIso: new Date(Date.parse(firstBucket.bucket)).toISOString(),
      toIso: new Date(Date.parse(lastBucket.bucket) + bucketWidthMs - 1).toISOString(),
    }
  }, [issue?.trend, issue?.trendBucketSeconds])

  // The drawer's per-issue trend always shows incidents when the org has the feature flag —
  // there's no toggle here, but we still respect the same flag the histograms gate on so the
  // overlay vanishes everywhere consistently when the flag flips off.
  const { flagEnabled: incidentsFlagEnabled } = useShowIncidentsOverlay()
  const { data: trendIncidents } = useProjectAlertIncidentsInRange({
    projectId,
    fromIso: trendIncidentRange?.fromIso ?? "",
    toIso: trendIncidentRange?.toIso ?? "",
    sourceType: "signal",
    sourceId: signalId,
    enabled: incidentsFlagEnabled && trendIncidentRange !== null,
  })
  const openSessionSheet = (sessionId: string) => {
    resetSessionPanelParams()
    setSessionSheetSessionId(sessionId)
  }

  // Drops the flag here and clears the id in `onClosed`, so the exit animation runs before the sync effect sees it.
  const closeSessionSheet = () => {
    setSessionSheetOpen(false)
    onOverlayActiveChange?.(false)
  }

  const sessionColumns: InfiniteTableColumn<SessionRecord>[] = [
    {
      key: "time",
      header: "Time",
      width: 110,
      minWidth: 100,
      render: (session) => (
        <span title={new Date(session.startTime).toLocaleString()}>{relativeTime(new Date(session.startTime))}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 90,
      minWidth: 80,
      render: (session) =>
        session.errorCount > 0 ? (
          <Status variant="destructive" label="error" />
        ) : (
          <Status variant="success" label="ok" />
        ),
    },
    {
      key: "duration",
      header: "Duration",
      width: 90,
      minWidth: 80,
      align: "end",
      render: (session) => <span className="tabular-nums">{formatDuration(session.durationNs)}</span>,
    },
    {
      key: "name",
      header: "Session",
      width: 320,
      minWidth: 200,
      render: (session) => (
        <Text.H5 noWrap ellipsis>
          {session.rootSpanName || session.sessionId}
        </Text.H5>
      ),
    },
    {
      key: "sessionId",
      header: "Session ID",
      width: 160,
      minWidth: 120,
      render: (session) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: click containment only
        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <CopyableText value={session.sessionId} size="sm" ellipsis tooltip="Copy session id" />
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        {variant === "drawer" ? (
          <div className="flex shrink-0 flex-col gap-3 border-b px-6 py-4">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                {isLoading ? (
                  <Skeleton className="h-7 w-56" />
                ) : (
                  <Text.H4M>{issue?.name ?? "Signal not found"}</Text.H4M>
                )}
                {isLoading ? (
                  <Skeleton className="h-5 w-full" />
                ) : (
                  <Text.H5 color="foregroundMuted">{issue?.description ?? "We couldn't load this issue."}</Text.H5>
                )}
              </div>
              {!isLoading && issue && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex min-w-[33%] max-w-max flex-1">
                    <CopyableText value={issue.slug} size="sm" ellipsis tooltip="Copy issue slug" />
                  </div>
                  {issue.tags.length > 0 && <TagList tags={issue.tags} wrap />}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Page renders its own `Layout.Header` (with `pb-0`) directly above, so
            the body only needs a slim top pad; the drawer keeps the full `pt-6`
            since its in-body header sits above with a border. */}
        <div className={`flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6 ${variant === "page" ? "pt-2" : "pt-6"}`}>
          {prepend}
          {variant === "drawer" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-row flex-wrap content-start items-start gap-x-8 gap-y-4">
                {isLoading ? (
                  <SummaryField label="Status" value={<Skeleton className="h-5 w-24" />} />
                ) : issue && issue.states.length > 0 ? (
                  <SummaryField label="Status" value={<SignalLifecycleStatuses states={issue.states} wrap />} />
                ) : null}
                <SummaryField
                  label="Seen at"
                  value={
                    isLoading ? (
                      <Skeleton className="h-5 w-32" />
                    ) : issue ? (
                      <SeenAtSummaryValue lastSeenAtIso={issue.lastSeenAt} firstSeenAtIso={issue.firstSeenAt} />
                    ) : (
                      "-"
                    )
                  }
                />
                {!isLoading && issue?.resolvedAt ? (
                  <SummaryField
                    label="Resolved at"
                    value={<SignalLifecycleTimestampSummaryValue tooltipHeading="Resolved at" iso={issue.resolvedAt} />}
                  />
                ) : null}
                {!isLoading && issue?.ignoredAt ? (
                  <SummaryField
                    label="Ignored at"
                    value={<SignalLifecycleTimestampSummaryValue tooltipHeading="Ignored at" iso={issue.ignoredAt} />}
                  />
                ) : null}
                {!isLoading && issue?.mutedAt ? (
                  <SummaryField
                    label="Muted at"
                    value={<SignalLifecycleTimestampSummaryValue tooltipHeading="Muted at" iso={issue.mutedAt} />}
                  />
                ) : null}
                <SummaryField
                  label="Occurrences"
                  value={
                    isLoading ? (
                      <Skeleton className="h-5 w-16" />
                    ) : (
                      <Text.H5 color="foreground">{issue ? formatCount(issue.totalOccurrences) : "-"}</Text.H5>
                    )
                  }
                />
              </div>
            </div>
          ) : null}

          {variant === "page" && trendAside ? (
            // Page: Trend (wide) and the aside (e.g. Patterns) share one row at a
            // fixed height so they always line up; each scrolls internally if taller.
            <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
              <div
                className={`flex ${SIGNAL_PAGE_PANEL_HEIGHT} min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4 xl:flex-1`}
              >
                <Text.H6 color="foregroundMuted">Trend</Text.H6>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <SignalTrendBar
                    buckets={issue?.trend ?? []}
                    bucketSeconds={issue?.trendBucketSeconds ?? 24 * 60 * 60}
                    height={SIGNAL_PAGE_TREND_CHART_HEIGHT}
                    isLoading={isLoading}
                    labelLayout="floating"
                    maxVisibleBucketLabels={4}
                    barVariant="details"
                    states={issue?.states ?? []}
                    escalationThresholds={issue?.trendEscalationThresholds ?? null}
                    incidents={trendIncidents}
                  />
                </div>
              </div>
              <div className={`${SIGNAL_PAGE_PANEL_HEIGHT} xl:w-[340px] xl:shrink-0`}>{trendAside}</div>
            </div>
          ) : (
            <DetailSection
              icon={<Icon icon={ArrowDownRightIcon} size="sm" />}
              label="Trend"
              defaultOpen
              contentClassName="pl-0 max-h-none overflow-visible"
            >
              <div className="flex flex-col rounded-lg bg-secondary p-2">
                <div className="px-4 py-3">
                  <SignalTrendBar
                    buckets={issue?.trend ?? []}
                    bucketSeconds={issue?.trendBucketSeconds ?? 24 * 60 * 60}
                    height={120}
                    isLoading={isLoading}
                    labelLayout="floating"
                    maxVisibleBucketLabels={4}
                    barVariant="details"
                    states={issue?.states ?? []}
                    escalationThresholds={issue?.trendEscalationThresholds ?? null}
                    incidents={trendIncidents}
                  />
                </div>
              </div>
            </DetailSection>
          )}

          {/* The page variant relocates Evaluations into the summary card's actions
              column (see `SignalSummary`), so it only renders here for the drawer. */}
          {variant === "drawer" ? (
            <DetailSection
              icon={<Icon icon={CheckIcon} size="sm" />}
              label="Evaluations"
              defaultOpen
              contentClassName="pl-0 max-h-none overflow-visible"
            >
              <SignalDrawerEvaluations
                projectId={projectId}
                signalId={signalId}
                signalSource={issue?.source ?? "annotation"}
                signalOrigin={issue?.origin ?? "system"}
                evaluations={issue?.evaluations ?? []}
                flaggerSlugs={issue?.flaggerSlugs ?? []}
                canMonitorSignal={issue ? issue.resolvedAt === null && issue.ignoredAt === null : false}
                isSignalLoading={isLoading}
              />
            </DetailSection>
          ) : null}

          {beforeTraces}

          <div ref={sessionsSectionRef} className="flex min-w-0 flex-col">
            <DetailSection
              icon={<Icon icon={TextAlignStartIcon} size="sm" />}
              label="Sessions"
              defaultOpen
              className="gap-1"
              contentClassName="pl-0 pt-0 max-h-none overflow-hidden flex flex-col"
            >
              {sessionSelection.selectedCount > 0 ? (
                <div className="flex items-center gap-2 pb-2">
                  <Button variant="outline" size="sm" onClick={() => setAddToDatasetOpen(true)}>
                    <Icon icon={DatabaseIcon} size="xs" />
                    Add to dataset ({sessionSelection.selectedCount.toLocaleString()})
                  </Button>
                </div>
              ) : null}
              <InfiniteTable
                data={sessions}
                isLoading={sessionsLoading}
                columns={sessionColumns}
                getRowKey={(session) => session.sessionId}
                selection={sessionSelection}
                onRowClick={(session) => openSessionSheet(session.sessionId)}
                getRowAriaLabel={(session) => `Open session ${session.sessionId}`}
                infiniteScroll={infiniteScroll}
                blankSlate="This issue hasn't shown up on any sessions yet."
                scrollAreaLayout="intrinsic"
                className="max-h-[min(28rem,50vh)]"
              />
            </DetailSection>
          </div>

          {append}
        </div>
      </div>

      <Sheet
        open={sessionSheetOpen}
        onClose={closeSessionSheet}
        onClosed={() => {
          setSessionSheetSessionId("")
          resetSessionPanelParams()
        }}
        closeAriaLabel="Close session panel"
      >
        {sessionSheetSessionId.length > 0 ? (
          <SessionDetailDrawer
            key={sessionSheetSessionId}
            projectId={projectId}
            sessionId={sessionSheetSessionId}
            onClose={closeSessionSheet}
            defaultTab="conversation"
            focusSignalId={signalId}
          />
        ) : null}
      </Sheet>

      {datasetSelection ? (
        <AddToDatasetModal
          open={addToDatasetOpen}
          onOpenChange={setAddToDatasetOpen}
          projectId={projectId}
          itemLabel="session"
          selectedCount={sessionSelection.selectedCount}
          onAddToExisting={(datasetId) =>
            addTracesToDatasetFunction({ data: { projectId, datasetId, signalId, selection: datasetSelection } })
          }
          onCreateNew={(name) =>
            createDatasetFromTracesFunction({ data: { projectId, name, signalId, selection: datasetSelection } })
          }
          onSuccess={sessionSelection.clearSelections}
        />
      ) : null}
    </>
  )
}
