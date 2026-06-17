import { Button, CopyableText, DetailSection, Icon, Sheet, Skeleton, TagList, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { ArrowDownRightIcon, CheckIcon, DatabaseIcon, TextAlignStartIcon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { HotkeyBadge } from "../../../../../../components/hotkey-badge.tsx"
import { useProjectAlertIncidentsInRange } from "../../../../../../domains/alerts/alerts.collection.ts"
import { useShowIncidentsOverlay } from "../../../../../../domains/alerts/use-show-incidents-overlay.ts"
import {
  useSignalDetail,
  useSignalTracesCount,
  useSignalTracesInfiniteScroll,
} from "../../../../../../domains/signals/signals.collection.ts"
import { useSelectableRows } from "../../../../../../lib/hooks/useSelectableRows.ts"
import { AddToDatasetModal } from "../../-components/add-to-dataset-modal.tsx"
import {
  DEFAULT_TRACE_TABLE_SORTING,
  ProjectTracesTable,
  type TraceColumnId,
} from "../../-components/project-traces-table.tsx"
import { TraceDetailDrawer } from "../../-components/trace-detail-drawer.tsx"
import { SignalDrawerEvaluations } from "./signal-drawer-evaluations.tsx"
import { formatSignalAgeAgoLabel, formatSeenAgeParts } from "./signal-formatters.ts"
import { SignalLifecycleStatuses } from "./signal-lifecycle-statuses.tsx"
import { SignalTrendBar } from "./signal-trend-bar.tsx"

/**
 * Shared fixed height for the page's side-by-side Trend + Patterns panels, so
 * the two always line up; each scrolls internally if its content is taller.
 */
const SIGNAL_PAGE_PANEL_HEIGHT = "h-72"
/** Trend chart height inside that panel (leaves room for the panel header + padding). */
const SIGNAL_PAGE_TREND_CHART_HEIGHT = 200

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
  readonly lastSeenAtIso: string
  readonly firstSeenAtIso: string
}) {
  const { lastSeenLabel, firstSeenLabel } = formatSeenAgeParts(lastSeenAtIso, firstSeenAtIso)

  // Flex `div` not `Text`: `Text`'s `display:inline` collapses the `gap-*` around the separator. Bare `<span>` triggers so Radix's hover handlers land on a real DOM node.
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-sm leading-5">
      <Tooltip asChild trigger={<span className="break-words">{lastSeenLabel}</span>}>
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted">Last seen at</Text.H6>
          <Text.H6B>{new Date(lastSeenAtIso).toLocaleString()}</Text.H6B>
        </div>
      </Tooltip>
      <span className="shrink-0 text-muted-foreground">/</span>
      <Tooltip asChild trigger={<span className="break-words">{firstSeenLabel}</span>}>
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted">First seen at</Text.H6>
          <Text.H6B>{new Date(firstSeenAtIso).toLocaleString()}</Text.H6B>
        </div>
      </Tooltip>
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

const SIGNAL_TRACE_COLUMN_IDS = ["startTime", "name", "tags", "duration"] as const satisfies readonly TraceColumnId[]

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
    data: traces,
    isLoading: tracesLoading,
    infiniteScroll,
  } = useSignalTracesInfiniteScroll({
    projectId,
    signalId,
    enabled: issue !== null,
  })
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)
  const [traceSheetTraceId, setTraceSheetTraceId] = useState<string | null>(null)
  const [traceSheetOpen, setTraceSheetOpen] = useState(false)

  const traceIds = useMemo(() => traces.map((t) => t.traceId), [traces])
  const totalTraceCount = useSignalTracesCount({ projectId, signalId, enabled: issue !== null })
  const traceSelection = useSelectableRows({ rowIds: traceIds, totalRowCount: totalTraceCount })

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
    sourceType: "issue",
    sourceId: signalId,
    enabled: incidentsFlagEnabled && trendIncidentRange !== null,
  })
  const { selectedCount, bulkSelection, clearSelections } = traceSelection

  const openTraceSheet = (traceId: string) => {
    setTraceSheetTraceId(traceId)
    setTraceSheetOpen(true)
    onOverlayActiveChange?.(true)
  }

  const closeTraceSheet = () => {
    setTraceSheetOpen(false)
    onOverlayActiveChange?.(false)
  }

  const traceSheetIndex = traceSheetTraceId ? traceIds.indexOf(traceSheetTraceId) : -1
  const canNavigateNextTraceInSheet =
    traceSheetTraceId !== null && traceIds.length > 0 && (traceSheetIndex < 0 || traceSheetIndex < traceIds.length - 1)
  const canNavigatePrevTraceInSheet =
    traceSheetTraceId !== null && traceIds.length > 0 && (traceSheetIndex < 0 || traceSheetIndex > 0)

  const onNextTraceInSheet = () => {
    if (!traceSheetTraceId) return
    const idx = traceIds.indexOf(traceSheetTraceId)
    const next = idx < 0 ? traceIds[0] : traceIds[idx + 1]
    if (next) setTraceSheetTraceId(next)
  }

  const onPrevTraceInSheet = () => {
    if (!traceSheetTraceId) return
    const idx = traceIds.indexOf(traceSheetTraceId)
    const prev = idx <= 0 ? undefined : traceIds[idx - 1]
    if (prev) setTraceSheetTraceId(prev)
  }

  const getTraceRowAriaLabel = (input: { readonly traceId: string; readonly rootSpanName: string }) => {
    const shortName = input.rootSpanName || input.traceId.slice(0, 8)
    return `Open trace ${shortName} in the conversation panel`
  }

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
                  <Text.H5 color="foregroundMuted">{issue?.description ?? "This issue could not be loaded."}</Text.H5>
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
                    resolvedAt={issue?.resolvedAt ?? null}
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
                    resolvedAt={issue?.resolvedAt ?? null}
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
                evaluations={issue?.evaluations ?? []}
                flaggerSlugs={issue?.flaggerSlugs ?? []}
                canMonitorSignal={issue ? issue.resolvedAt === null && issue.ignoredAt === null : false}
                isSignalLoading={isLoading}
              />
            </DetailSection>
          ) : null}

          {beforeTraces}

          <DetailSection
            icon={<Icon icon={TextAlignStartIcon} size="sm" />}
            label="Traces"
            defaultOpen
            className="gap-1"
            contentClassName="pl-0 pt-0 max-h-none overflow-hidden flex flex-col"
          >
            {selectedCount > 0 && (
              <div className="flex items-center gap-2 pb-2">
                <Button variant="outline" size="sm" onClick={() => setAddToDatasetOpen(true)}>
                  <Icon icon={DatabaseIcon} size="sm" />
                  Add to Dataset ({selectedCount})
                </Button>
              </div>
            )}
            <ProjectTracesTable
              projectId={projectId}
              data={traces}
              isLoading={tracesLoading}
              visibleColumnIds={SIGNAL_TRACE_COLUMN_IDS}
              defaultSorting={DEFAULT_TRACE_TABLE_SORTING}
              onTraceClick={(trace) => openTraceSheet(trace.traceId)}
              getTraceRowAriaLabel={getTraceRowAriaLabel}
              rowInteractionRole="button"
              activeTraceId={traceSheetTraceId ?? undefined}
              selection={traceSelection}
              infiniteScroll={infiniteScroll}
              blankSlate="This issue has not been seen on any traces yet."
              scrollAreaLayout="intrinsic"
              scrollContainerClassName="max-h-[min(28rem,50vh)]"
            />
          </DetailSection>

          {append}
        </div>

        {bulkSelection && (
          <AddToDatasetModal
            open={addToDatasetOpen}
            onOpenChange={setAddToDatasetOpen}
            projectId={projectId}
            signalId={signalId}
            selection={bulkSelection}
            selectedCount={selectedCount}
            onSuccess={clearSelections}
          />
        )}
      </div>

      <Sheet
        open={traceSheetOpen}
        onClose={closeTraceSheet}
        onClosed={() => setTraceSheetTraceId(null)}
        closeAriaLabel="Close trace panel"
      >
        {traceSheetTraceId ? (
          <TraceDetailDrawer
            key={traceSheetTraceId}
            projectId={projectId}
            traceId={traceSheetTraceId}
            trace={traces.find((t) => t.traceId === traceSheetTraceId)}
            onClose={closeTraceSheet}
            onNextTrace={onNextTraceInSheet}
            onPrevTrace={onPrevTraceInSheet}
            canNavigateNext={canNavigateNextTraceInSheet}
            canNavigatePrev={canNavigatePrevTraceInSheet}
            urlSyncedTabs={false}
            initialTab="conversation"
            drawerStoreKey="issue-trace-detail-drawer-width"
            closeLabel={
              <>
                Back to issue <HotkeyBadge hotkey="Escape" />
              </>
            }
          />
        ) : null}
      </Sheet>
    </>
  )
}
