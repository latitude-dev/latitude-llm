import {
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  Modal,
  ProviderIcon,
  Status,
  type StatusProps,
  Text,
  Tooltip,
  useToast,
} from "@repo/ui"
import { formatDuration, relativeTime } from "@repo/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { BanIcon, EllipsisVerticalIcon, PlayIcon, RotateCcwIcon } from "lucide-react"
import { useMemo, useState } from "react"
import {
  cancelImport,
  type ImportRecord,
  importsQueryKey,
} from "../../../../../../../domains/imports/imports.functions.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"

const SOURCE_LABELS: Record<ImportRecord["source"], string> = {
  langfuse: "Langfuse",
  langsmith: "LangSmith",
  braintrust: "Braintrust",
}

const STATUS_META: Record<
  ImportRecord["status"],
  { readonly label: string; readonly variant: StatusProps["variant"] }
> = {
  created: { label: "Created", variant: "info" },
  queued: { label: "Queued", variant: "info" },
  running: { label: "Running", variant: "info" },
  succeeded: { label: "Succeeded", variant: "success" },
  capped: { label: "Capped", variant: "warning" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "neutral" },
}

const numberFormatter = new Intl.NumberFormat("en-US")

const isActiveStatus = (status: ImportRecord["status"]) =>
  status === "created" || status === "queued" || status === "running"

/** Kept in step with `RESUMABLE_STATUSES` in retryImportUseCase, which is what enforces it. */
const RESUMABLE_STATUSES: readonly ImportRecord["status"][] = ["failed", "cancelled", "capped"]

const progressPercent = (job: ImportRecord): number => {
  if (job.config.maxTraces <= 0) return 0
  return Math.min(100, Math.round((job.stats.tracesImported / job.config.maxTraces) * 100))
}

/**
 * Runtime so far for a job still running — the list repolls while one is active, which is what
 * keeps it ticking — and the final runtime once it finished. Zero before the worker picks it up.
 */
const durationNs = (job: ImportRecord): number => {
  if (!job.startedAt) return 0
  const endMs = job.finishedAt ? new Date(job.finishedAt).getTime() : isActiveStatus(job.status) ? Date.now() : 0
  if (endMs === 0) return 0
  return Math.max(0, endMs - new Date(job.startedAt).getTime()) * 1_000_000
}

const NS_PER_SECOND = 1_000_000_000

/** `formatDuration` is whole units from a minute up; below that it adds decimals a job runtime doesn't need. */
const wholeUnitsDuration = (ns: number): string => {
  if (ns <= 0) return "-"
  if (ns < 60 * NS_PER_SECOND) return `${Math.max(1, Math.round(ns / NS_PER_SECOND))}s`
  return formatDuration(ns)
}

/**
 * Also carries why a cap stopped the import and why a succeeded one found nothing, so the
 * tooltip renders for any status whose row has something to explain, not only failures.
 */
function StatusCell({ job }: { readonly job: ImportRecord }) {
  const meta = STATUS_META[job.status]
  const pill = <Status variant={meta.variant} label={meta.label} />

  if (!job.error) return pill

  return (
    <Tooltip asChild trigger={pill}>
      {job.error}
    </Tooltip>
  )
}

function NumberCell({ value }: { readonly value: number }) {
  return (
    <Text.H6 color="foregroundMuted" noWrap align="right" display="block" className="tabular-nums">
      {numberFormatter.format(value)}
    </Text.H6>
  )
}

function ActionsCell({
  job,
  onCancelRequest,
  onRetry,
}: {
  readonly job: ImportRecord
  readonly onCancelRequest: (job: ImportRecord) => void
  readonly onRetry: (job: ImportRecord) => void
}) {
  const active = isActiveStatus(job.status)
  const resumable = RESUMABLE_STATUSES.includes(job.status)

  return (
    <div className="flex justify-end">
      <DropdownMenuRoot modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            aria-label="Import actions"
            disabled={!active && !resumable}
          >
            <Icon icon={EllipsisVerticalIcon} size="sm" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {resumable ? (
            <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={() => onRetry(job)}>
              <Icon icon={job.status === "capped" ? PlayIcon : RotateCcwIcon} size="sm" />
              <Text.H5>{job.status === "capped" ? "Continue import" : "Retry import"}</Text.H5>
            </DropdownMenuItem>
          ) : null}
          {active ? (
            <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={() => onCancelRequest(job)}>
              <Icon icon={BanIcon} size="sm" color="destructive" />
              <Text.H5 color="destructive">Cancel import</Text.H5>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenuRoot>
    </div>
  )
}

function CancelImportConfirmModal({
  projectId,
  job,
  onOpenChange,
}: {
  readonly projectId: string
  readonly job: ImportRecord | null
  readonly onOpenChange: (job: ImportRecord | null) => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const cancelMutation = useMutation({
    mutationFn: (importJobId: string) => cancelImport({ data: { importJobId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: importsQueryKey(projectId) })
      onOpenChange(null)
    },
    onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
  })

  return (
    <Modal
      open={job !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(null)
      }}
      title="Cancel import"
      dismissible
      description={
        job
          ? `This will stop the ${SOURCE_LABELS[job.source]} import of ${job.config.sourceProjectName}. Traces already imported will stay, and you will be able to continue or retry the import at any time.`
          : undefined
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={cancelMutation.isPending} onClick={() => onOpenChange(null)}>
            Keep importing
          </Button>
          <Button
            variant="destructive"
            disabled={cancelMutation.isPending}
            isLoading={cancelMutation.isPending}
            onClick={() => job && cancelMutation.mutate(job.id)}
          >
            Cancel import
          </Button>
        </div>
      }
    />
  )
}

export function ImportJobsTable({
  jobs,
  projectId,
  onRetry,
}: {
  readonly jobs: readonly ImportRecord[]
  readonly projectId: string
  readonly onRetry: (job: ImportRecord) => void
}) {
  const [cancelTarget, setCancelTarget] = useState<ImportRecord | null>(null)

  const columns = useMemo(
    (): InfiniteTableColumn<ImportRecord>[] => [
      {
        key: "createdAt",
        header: "Time",
        width: 120,
        maxWidth: 120,
        render: (job) => (
          <Text.H6 color="foregroundMuted" noWrap>
            {relativeTime(job.createdAt)}
          </Text.H6>
        ),
      },
      {
        key: "source",
        header: "Source",
        render: (job) => (
          <Text.H6 noWrap ellipsis>
            {job.config.sourceProjectName}
          </Text.H6>
        ),
      },
      {
        key: "platform",
        header: "Platform",
        width: 120,
        maxWidth: 140,
        render: (job) => (
          <div className="flex flex-row items-center gap-1.5">
            <ProviderIcon provider={job.source} size="xs" className="shrink-0" />
            <Text.H6 color="foregroundMuted" noWrap>
              {SOURCE_LABELS[job.source]}
            </Text.H6>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: 110,
        maxWidth: 130,
        render: (job) => <StatusCell job={job} />,
      },
      {
        key: "progress",
        header: "Progress",
        width: 90,
        maxWidth: 90,
        align: "end",
        render: (job) => (
          <Text.H6 color="foregroundMuted" noWrap align="right" display="block" className="tabular-nums">
            {progressPercent(job)}%
          </Text.H6>
        ),
      },
      {
        key: "duration",
        header: "Duration",
        width: 90,
        minWidth: 80,
        maxWidth: 90,
        align: "end",
        render: (job) => (
          <Text.H6 color="foregroundMuted" noWrap align="right" display="block" className="tabular-nums">
            {wholeUnitsDuration(durationNs(job))}
          </Text.H6>
        ),
      },
      {
        key: "sessions",
        header: "Sessions",
        width: 90,
        maxWidth: 110,
        align: "end",
        render: (job) => <NumberCell value={job.stats.sessionsImported} />,
      },
      {
        key: "traces",
        header: "Traces",
        width: 90,
        maxWidth: 110,
        align: "end",
        render: (job) => <NumberCell value={job.stats.tracesImported} />,
      },
      {
        key: "spans",
        header: "Spans",
        width: 90,
        maxWidth: 110,
        align: "end",
        render: (job) => <NumberCell value={job.stats.spansImported} />,
      },
      {
        key: "actions",
        header: "",
        width: 56,
        maxWidth: 56,
        align: "end",
        render: (job) => <ActionsCell job={job} onCancelRequest={setCancelTarget} onRetry={onRetry} />,
      },
    ],
    [onRetry],
  )

  return (
    <>
      <InfiniteTable
        data={jobs}
        columns={columns}
        getRowKey={(job) => job.id}
        scrollAreaLayout="intrinsic"
        className="max-h-full"
      />
      <CancelImportConfirmModal projectId={projectId} job={cancelTarget} onOpenChange={setCancelTarget} />
    </>
  )
}
