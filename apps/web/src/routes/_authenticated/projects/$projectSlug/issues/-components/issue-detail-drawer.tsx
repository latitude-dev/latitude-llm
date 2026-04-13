import {
  Button,
  Checkbox,
  DetailDrawer,
  DetailSection,
  DetailSummary,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  Modal,
  Skeleton,
  Text,
  Tooltip,
  useToast,
} from "@repo/ui"
import { formatCount, formatDuration, relativeTime } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { ArrowDownIcon, ArrowDownRightIcon, ArrowUpIcon, MessageSquareTextIcon, RadarIcon } from "lucide-react"
import { useState } from "react"
import { HotkeyBadge } from "../../../../../../components/hotkey-badge.tsx"
import {
  invalidateIssueQueries,
  useIssueDetail,
  useIssueTracesInfiniteScroll,
} from "../../../../../../domains/issues/issues.collection.ts"
import { applyIssueLifecycleAction, type IssueTraceRecord } from "../../../../../../domains/issues/issues.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { IssueDrawerEvaluations } from "./issue-drawer-evaluations.tsx"
import { formatSeenAge } from "./issue-formatters.ts"
import { IssueLifecycleBadges } from "./issue-lifecycle-badges.tsx"
import { IssueTrendBar } from "./issue-trend-bar.tsx"

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
  const [keepMonitoring, setKeepMonitoring] = useState(true)
  const [isLifecycleLoading, setIsLifecycleLoading] = useState(false)

  const traceColumns: InfiniteTableColumn<IssueTraceRecord>[] = [
    {
      key: "timestamp",
      header: "Timestamp",
      minWidth: 180,
      render: (trace) => relativeTime(new Date(trace.startTime)),
    },
    {
      key: "duration",
      header: "Duration",
      minWidth: 120,
      align: "end",
      render: (trace) => formatDuration(trace.durationNs),
    },
  ]

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
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setIsLifecycleLoading(false)
    }
  }

  useHotkeys([
    {
      hotkey: "Alt+ArrowDown",
      callback: () => onNextIssue?.(),
      options: { enabled: canNavigateNext && !!onNextIssue },
    },
    {
      hotkey: "Alt+ArrowUp",
      callback: () => onPrevIssue?.(),
      options: { enabled: canNavigatePrev && !!onPrevIssue },
    },
  ])

  const summaryItems =
    issue === null || issue === undefined
      ? [
          { label: "Seen at", isLoading: isLoading, value: undefined },
          { label: "Occurrences", isLoading: isLoading, value: undefined },
        ]
      : [
          {
            label: "Seen at",
            value: formatSeenAge(issue.lastSeenAt, issue.firstSeenAt),
          },
          {
            label: "Occurrences",
            value: formatCount(issue.totalOccurrences),
          },
        ]

  return (
    <>
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
        rightActions={
          <>
            <Button
              variant="outline"
              disabled={issue === null || issue === undefined || isLifecycleLoading}
              onClick={() => void runLifecycleCommand(issue?.ignoredAt ? "unignore" : "ignore")}
            >
              {issue?.ignoredAt ? "Unignore" : "Ignore"}
            </Button>
            <Button
              disabled={issue === null || issue === undefined || isLifecycleLoading}
              onClick={() => {
                if (issue?.resolvedAt) {
                  void runLifecycleCommand("unresolve")
                  return
                }

                setKeepMonitoring(issue?.keepMonitoringDefault ?? true)
                setResolveModalOpen(true)
              }}
            >
              {issue?.resolvedAt ? "Unresolve" : "Resolve"}
            </Button>
          </>
        }
        header={
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              {isLoading ? <Skeleton className="h-7 w-56" /> : <Text.H4M>{issue?.name ?? "Issue not found"}</Text.H4M>}
              {isLoading ? (
                <Skeleton className="h-5 w-full" />
              ) : (
                <Text.H5 color="foregroundMuted">{issue?.description ?? "This issue could not be loaded."}</Text.H5>
              )}
            </div>
          </div>
        }
      >
        <div className="flex flex-col flex-1 overflow-y-auto p-6 gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Text.H6 color="foregroundMuted">Issue status</Text.H6>
              {isLoading ? <Skeleton className="h-5 w-48" /> : <IssueLifecycleBadges states={issue?.states ?? []} />}
            </div>
            <DetailSummary items={summaryItems} />
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
                  height={120}
                  isLoading={isLoading}
                  barVariant="primary"
                  states={issue?.states ?? []}
                  resolvedAt={issue?.resolvedAt ?? null}
                  escalationOccurrenceThreshold={issue?.escalationOccurrenceThreshold ?? null}
                  showEscalationThresholdGuide
                />
              </div>
            </div>
          </DetailSection>

          <DetailSection
            icon={<Icon icon={RadarIcon} size="sm" />}
            label="Evaluations"
            defaultOpen
            contentClassName="pl-0 max-h-none overflow-visible"
          >
            {issue ? (
              <IssueDrawerEvaluations projectId={projectId} issueId={issueId} evaluations={issue.evaluations} />
            ) : (
              <Skeleton className="h-24 w-full" />
            )}
          </DetailSection>

          <DetailSection
            icon={<Icon icon={MessageSquareTextIcon} size="sm" />}
            label="Traces"
            defaultOpen
            contentClassName="pl-0 max-h-none overflow-visible"
          >
            <div className="flex min-h-72 flex-col">
              <InfiniteTable
                data={traces}
                isLoading={tracesLoading}
                columns={traceColumns}
                getRowKey={(trace) => trace.traceId}
                infiniteScroll={infiniteScroll}
                blankSlate="This issue has not been seen on any traces yet."
              />
            </div>
          </DetailSection>
        </div>
      </DetailDrawer>

      <Modal.Root open={resolveModalOpen} onOpenChange={setResolveModalOpen}>
        <Modal.Content dismissible>
          <Modal.Header
            title="Resolve issue"
            description="Choose whether linked evaluations should keep monitoring this issue after it is resolved."
          />
          <Modal.Body>
            <div className="flex flex-col gap-3">
              <div className="flex flex-row items-center gap-2">
                <Checkbox
                  checked={keepMonitoring}
                  onCheckedChange={(checked) => setKeepMonitoring(checked === true)}
                  aria-label="Keep linked evaluations monitoring this issue"
                />
                <Text.H6>Keep linked evaluations monitoring this issue</Text.H6>
              </div>
              <Text.H6 color="foregroundMuted">
                When disabled, resolving the issue will archive all linked evaluations immediately.
              </Text.H6>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline" onClick={() => setResolveModalOpen(false)} disabled={isLifecycleLoading}>
              Cancel
            </Button>
            <Button onClick={() => void runLifecycleCommand("resolve", keepMonitoring)} disabled={isLifecycleLoading}>
              Resolve issue
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
