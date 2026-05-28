import {
  Button,
  CloseTrigger,
  CopyableText,
  DetailDrawer,
  DetailSection,
  Icon,
  Label,
  Modal,
  Sheet,
  Skeleton,
  Switch,
  TagList,
  Text,
  Tooltip,
  useToast,
} from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import {
  ArrowDownIcon,
  ArrowDownRightIcon,
  ArrowUpIcon,
  CheckIcon,
  DatabaseIcon,
  PauseIcon,
  PlayIcon,
  TextAlignStartIcon,
  XIcon,
} from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { HotkeyBadge } from "../../../../../../components/hotkey-badge.tsx"
import { useProjectAlertIncidentsInRange } from "../../../../../../domains/alerts/alerts.collection.ts"
import { useShowIncidentsOverlay } from "../../../../../../domains/alerts/use-show-incidents-overlay.ts"
import {
  invalidateIssueQueries,
  useIssueDetail,
  useIssueTracesCount,
  useIssueTracesInfiniteScroll,
} from "../../../../../../domains/issues/issues.collection.ts"
import { applyIssueLifecycleAction } from "../../../../../../domains/issues/issues.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { useSelectableRows } from "../../../../../../lib/hooks/useSelectableRows.ts"
import { AddToDatasetModal } from "../../-components/add-to-dataset-modal.tsx"
import {
  DEFAULT_TRACE_TABLE_SORTING,
  ProjectTracesTable,
  type TraceColumnId,
} from "../../-components/project-traces-table.tsx"
import { TraceDetailDrawer } from "../../-components/trace-detail-drawer.tsx"
import { IssueDrawerEvaluations } from "./issue-drawer-evaluations.tsx"
import { formatIssueAgeAgoLabel, formatSeenAgeParts } from "./issue-formatters.ts"
import { IssueLifecycleStatuses } from "./issue-lifecycle-statuses.tsx"
import { IssueTrendBar } from "./issue-trend-bar.tsx"

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

  return (
    <Text.H5 color="foreground" className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
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
    </Text.H5>
  )
}

function IssueLifecycleTimestampSummaryValue({
  tooltipHeading,
  iso,
}: {
  readonly tooltipHeading: string
  readonly iso: string
}) {
  const label = formatIssueAgeAgoLabel(iso)

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

type LifecycleConfirmationAction = "ignore" | "unignore" | "unresolve"

const ISSUE_TRACE_COLUMN_IDS = ["startTime", "name", "tags", "duration"] as const satisfies readonly TraceColumnId[]

function getLifecycleConfirmation(action: LifecycleConfirmationAction) {
  switch (action) {
    case "ignore":
      return {
        title: "Ignore issue",
        description:
          "Mark this issue as ignored. We won't monitor or alert you about new occurrences of this issue anymore",
        confirmLabel: "Ignore",
        confirmIcon: PauseIcon,
        confirmVariant: "destructive" as const,
      }
    case "unignore":
      return {
        title: "Unignore issue",
        description: "Stop ignoring this issue. New occurrences will surface it again",
        confirmLabel: "Unignore",
        confirmIcon: PlayIcon,
        confirmVariant: undefined,
      }
    case "unresolve":
      return {
        title: "Unresolve issue",
        description: "Reopen this issue. New occurrences won't mark this issue as regressed",
        confirmLabel: "Unresolve",
        confirmIcon: XIcon,
        confirmVariant: "destructive" as const,
      }
  }
}

/**
 * Issue detail surface minus the `DetailDrawer` chrome (close, next/prev nav).
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
export function IssueDetailBody({
  projectId,
  issueId,
  onOverlayActiveChange,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly onOverlayActiveChange?: (active: boolean) => void
}) {
  const { toast } = useToast()
  const { data: issue, isLoading } = useIssueDetail({ projectId, issueId })
  const {
    data: traces,
    isLoading: tracesLoading,
    infiniteScroll,
  } = useIssueTracesInfiniteScroll({
    projectId,
    issueId,
    enabled: issue !== null,
  })
  const [resolveModalOpen, setResolveModalOpen] = useState(false)
  const [lifecycleConfirmAction, setLifecycleConfirmAction] = useState<LifecycleConfirmationAction | null>(null)
  const [keepMonitoring, setKeepMonitoring] = useState(true)
  const [isLifecycleLoading, setIsLifecycleLoading] = useState(false)
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)
  const [traceSheetTraceId, setTraceSheetTraceId] = useState<string | null>(null)
  const [traceSheetOpen, setTraceSheetOpen] = useState(false)

  const traceIds = useMemo(() => traces.map((t) => t.traceId), [traces])
  const totalTraceCount = useIssueTracesCount({ projectId, issueId, enabled: issue !== null })
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
    sourceId: issueId,
    enabled: incidentsFlagEnabled && trendIncidentRange !== null,
  })
  const { selectedCount, bulkSelection, clearSelections } = traceSelection
  const hasActiveLinkedEvaluations =
    issue?.evaluations.some((evaluation) => evaluation.archivedAt === null && evaluation.deletedAt === null) ?? false
  const lifecycleConfirmation = lifecycleConfirmAction ? getLifecycleConfirmation(lifecycleConfirmAction) : null

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

  const runLifecycleCommand = async (command: "resolve" | "unresolve" | "ignore" | "unignore", override?: boolean) => {
    setIsLifecycleLoading(true)
    try {
      await applyIssueLifecycleAction({
        data: {
          projectId,
          issueId,
          command,
          ...(override !== undefined ? { keepMonitoring: override } : {}),
        },
      })
      await invalidateIssueQueries(projectId, issueId)
      toast({
        description:
          command === "resolve"
            ? "Issue resolved."
            : command === "unresolve"
              ? "Issue reopened."
              : command === "ignore"
                ? "Issue ignored."
                : "Issue unignored.",
      })
      setResolveModalOpen(false)
      setLifecycleConfirmAction(null)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setIsLifecycleLoading(false)
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-col gap-3 border-b px-6 py-4">
          <div className="flex flex-row items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-col gap-1">
                {isLoading ? (
                  <Skeleton className="h-7 w-56" />
                ) : (
                  <Text.H4M>{issue?.name ?? "Issue not found"}</Text.H4M>
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
            <div className="flex shrink-0 flex-row items-center gap-1">
              <Button
                variant="ghost"
                className="text-foreground group-hover:text-secondary-foreground/80"
                disabled={issue === null || issue === undefined || isLifecycleLoading}
                onClick={() => setLifecycleConfirmAction(issue?.ignoredAt ? "unignore" : "ignore")}
              >
                <Icon icon={issue?.ignoredAt ? PlayIcon : PauseIcon} size="sm" />
                {issue?.ignoredAt ? "Unignore" : "Ignore"}
              </Button>
              <Button
                variant="outline"
                disabled={issue === null || issue === undefined || isLifecycleLoading}
                onClick={() => {
                  if (issue?.resolvedAt) {
                    setLifecycleConfirmAction("unresolve")
                    return
                  }

                  setKeepMonitoring(issue?.keepMonitoringDefault ?? true)
                  setResolveModalOpen(true)
                }}
              >
                <Icon icon={issue?.resolvedAt ? XIcon : CheckIcon} size="sm" />
                {issue?.resolvedAt ? "Unresolve" : "Resolve"}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-row flex-wrap content-start items-start gap-x-8 gap-y-4">
              {isLoading ? (
                <SummaryField label="Status" value={<Skeleton className="h-5 w-24" />} />
              ) : issue && issue.states.length > 0 ? (
                <SummaryField label="Status" value={<IssueLifecycleStatuses states={issue.states} wrap />} />
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
                  value={<IssueLifecycleTimestampSummaryValue tooltipHeading="Resolved at" iso={issue.resolvedAt} />}
                />
              ) : null}
              {!isLoading && issue?.ignoredAt ? (
                <SummaryField
                  label="Ignored at"
                  value={<IssueLifecycleTimestampSummaryValue tooltipHeading="Ignored at" iso={issue.ignoredAt} />}
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

          <DetailSection
            icon={<Icon icon={ArrowDownRightIcon} size="sm" />}
            label="Trend"
            defaultOpen
            contentClassName="pl-0 max-h-none overflow-visible"
          >
            <div className="flex flex-col rounded-lg bg-secondary p-2">
              <div className="px-4 py-3">
                <IssueTrendBar
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

          <DetailSection
            icon={<Icon icon={CheckIcon} size="sm" />}
            label="Evaluations"
            defaultOpen
            contentClassName="pl-0 max-h-none overflow-visible"
          >
            <IssueDrawerEvaluations
              projectId={projectId}
              issueId={issueId}
              issueSource={issue?.source ?? "annotation"}
              evaluations={issue?.evaluations ?? []}
              flaggerSlugs={issue?.flaggerSlugs ?? []}
              canMonitorIssue={issue ? issue.resolvedAt === null && issue.ignoredAt === null : false}
              isIssueLoading={isLoading}
            />
          </DetailSection>

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
              visibleColumnIds={ISSUE_TRACE_COLUMN_IDS}
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
        </div>

        {bulkSelection && (
          <AddToDatasetModal
            open={addToDatasetOpen}
            onOpenChange={setAddToDatasetOpen}
            projectId={projectId}
            issueId={issueId}
            selection={bulkSelection}
            selectedCount={selectedCount}
            onSuccess={clearSelections}
          />
        )}

        <Modal.Root open={resolveModalOpen} onOpenChange={setResolveModalOpen}>
          <Modal.Content dismissible>
            <Modal.Header
              title="Resolve issue"
              description="Mark this issue as resolved. If this issue starts occurring again we will alert you and promote it as regressed"
            />
            {hasActiveLinkedEvaluations ? (
              <Modal.Body>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-row items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="keep-monitoring-on-resolve">Keep monitoring this issue</Label>
                      <Text.H6 color="foregroundMuted">
                        Evaluations monitoring this issue will stay active to detect further regressions
                      </Text.H6>
                    </div>
                    <Switch
                      id="keep-monitoring-on-resolve"
                      checked={keepMonitoring}
                      onCheckedChange={setKeepMonitoring}
                      disabled={isLifecycleLoading}
                      aria-label="Keep monitoring this issue"
                    />
                  </div>
                </div>
              </Modal.Body>
            ) : null}
            <Modal.Footer>
              <Button variant="outline" onClick={() => setResolveModalOpen(false)} disabled={isLifecycleLoading}>
                Cancel
              </Button>
              <Button onClick={() => void runLifecycleCommand("resolve", keepMonitoring)} disabled={isLifecycleLoading}>
                <Icon icon={CheckIcon} size="sm" />
                Resolve
              </Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>

        <Modal.Root
          open={lifecycleConfirmAction !== null}
          onOpenChange={(open) => (!open ? setLifecycleConfirmAction(null) : undefined)}
        >
          <Modal.Content dismissible>
            <Modal.Header
              title={lifecycleConfirmation?.title ?? "Confirm issue action"}
              description={lifecycleConfirmation?.description ?? "Are you sure you want to continue?"}
            />
            <Modal.Footer>
              <CloseTrigger />
              <Button
                {...(lifecycleConfirmation?.confirmVariant ? { variant: lifecycleConfirmation.confirmVariant } : {})}
                onClick={() => (lifecycleConfirmAction ? void runLifecycleCommand(lifecycleConfirmAction) : undefined)}
                disabled={lifecycleConfirmAction === null || isLifecycleLoading}
              >
                <Icon icon={lifecycleConfirmation?.confirmIcon ?? XIcon} size="sm" />
                {lifecycleConfirmation?.confirmLabel ?? "Confirm"}
              </Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
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

export function IssueDetailDrawer({
  projectId,
  issueId,
  onClose,
  onNextIssue,
  onPrevIssue,
  canNavigateNext,
  canNavigatePrev,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly onClose: () => void
  readonly onNextIssue?: () => void
  readonly onPrevIssue?: () => void
  readonly canNavigateNext: boolean
  readonly canNavigatePrev: boolean
}) {
  const [overlayActive, setOverlayActive] = useState(false)

  useHotkeys([
    {
      hotkey: "Alt+ArrowDown",
      callback: () => onNextIssue?.(),
      options: { enabled: canNavigateNext && !!onNextIssue && !overlayActive },
    },
    {
      hotkey: "Alt+ArrowUp",
      callback: () => onPrevIssue?.(),
      options: { enabled: canNavigatePrev && !!onPrevIssue && !overlayActive },
    },
  ])

  return (
    <DetailDrawer
      storeKey="issue-detail-drawer-width"
      onClose={onClose}
      closeLabel={
        <>
          Close <HotkeyBadge hotkey="Escape" />
        </>
      }
      actions={
        <>
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <Button
                variant="ghost"
                className="w-8 h-8 p-0"
                disabled={!canNavigateNext}
                onClick={onNextIssue}
                type="button"
                aria-label="Next issue"
              >
                <ArrowDownIcon className="w-4 h-4 text-muted-foreground" />
              </Button>
            }
          >
            Next issue <HotkeyBadge hotkey="Alt+ArrowDown" /> <HotkeyBadge hotkey="J" />
          </Tooltip>
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <Button
                variant="ghost"
                className="w-8 h-8 p-0"
                disabled={!canNavigatePrev}
                onClick={onPrevIssue}
                type="button"
                aria-label="Previous issue"
              >
                <ArrowUpIcon className="w-4 h-4 text-muted-foreground" />
              </Button>
            }
          >
            Previous issue <HotkeyBadge hotkey="Alt+ArrowUp" /> <HotkeyBadge hotkey="K" />
          </Tooltip>
        </>
      }
    >
      <IssueDetailBody projectId={projectId} issueId={issueId} onOverlayActiveChange={setOverlayActive} />
    </DetailDrawer>
  )
}
