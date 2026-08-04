import { Badge, Button, Card, Icon, Text } from "@repo/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Plus } from "lucide-react"
import { useState } from "react"
import { BlankSlate } from "../../../../../../../components/blank-slate.tsx"
import {
  cancelImport,
  getImport,
  type ImportRecord,
  listImports,
} from "../../../../../../../domains/imports/imports.functions.ts"
import { ImportRunsTable } from "./import-runs-table.tsx"
import { ImportWizardModal } from "./import-wizard-modal.tsx"

/** Kept in step with `RESUMABLE_STATUSES` in retryImportUseCase, which is what enforces it. */
const RESUMABLE_STATUSES: readonly ImportRecord["status"][] = ["failed", "cancelled", "capped"]

export const importsQueryKey = (projectId: string) => ["imports", projectId] as const

const statusVariant = (status: ImportRecord["status"]) => {
  switch (status) {
    case "succeeded":
      return "outlineSuccessMuted" as const
    case "running":
    case "queued":
    case "created":
      return "outlineAccent" as const
    case "capped":
      return "outlineWarningMuted" as const
    case "failed":
      return "destructive" as const
    case "cancelled":
      return "secondary" as const
  }
}

function ImportJobCard({
  job,
  projectId,
  onRetry,
}: {
  readonly job: ImportRecord
  readonly projectId: string
  readonly onRetry: (job: ImportRecord) => void
}) {
  const queryClient = useQueryClient()
  const [showRuns, setShowRuns] = useState(false)
  const isActive = job.status === "created" || job.status === "queued" || job.status === "running"

  const { data: detail } = useQuery({
    queryKey: ["import", job.id],
    queryFn: () => getImport({ data: { importJobId: job.id } }),
    enabled: isActive || showRuns,
    refetchInterval: isActive ? 3000 : false,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelImport({ data: { importJobId: job.id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importsQueryKey(projectId) }),
  })

  // The polled copy when one is in flight, otherwise the row from the list query.
  const live = detail ?? job
  const latestRun = live.runs[0]

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex flex-row items-center gap-2">
            <Text.H5M>{job.config.sourceProjectName}</Text.H5M>
            <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
          </div>
          <Text.H6M color="foregroundMuted">
            {job.source} · {live.stats.tracesImported.toLocaleString()} / {live.config.maxTraces.toLocaleString()}{" "}
            traces · {live.stats.spansImported.toLocaleString()} spans
          </Text.H6M>
        </div>
        {isActive ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
          >
            Cancel import
          </Button>
        ) : RESUMABLE_STATUSES.includes(live.status) ? (
          // A capped import is resumed rather than retried: nothing failed, the plan ran out of
          // usage, and it carries on from the cursor where that happened.
          <Button variant="outline" size="sm" onClick={() => onRetry(live)}>
            {live.status === "capped" ? "Continue import" : "Retry import"}
          </Button>
        ) : null}
      </div>
      {/*
        Also carries why a cap stopped the import, and why a succeeded one found nothing — neither
        is a failure, hence the status check. An import that fetched no rows at all gets a warning
        tone rather than a muted one: a green badge with zero traces is the one outcome a user is
        most likely to misread as fine.
      */}
      {live.error ? (
        <Text.H6M
          color={
            live.status === "failed"
              ? "destructive"
              : live.stats.spansImported === 0
                ? "warningMutedForeground"
                : "foregroundMuted"
          }
        >
          {live.error}
        </Text.H6M>
      ) : null}
      {latestRun ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-center justify-between gap-2">
            <Text.H6M color="foregroundMuted">
              Latest page: {latestRun.stats.spansImported.toLocaleString()} spans imported
              {latestRun.status === "failed" && latestRun.error ? ` · ${latestRun.error}` : ""}
            </Text.H6M>
            <Button variant="ghost" size="sm" onClick={() => setShowRuns((open) => !open)}>
              {showRuns ? "Hide pages" : `Show pages (${live.runs.length})`}
            </Button>
          </div>
          {showRuns ? <ImportRunsTable runs={live.runs} /> : null}
        </div>
      ) : null}
    </Card>
  )
}

export function ImportsPage({
  projectId,
  projectSlug: _projectSlug,
}: {
  readonly projectId: string
  readonly projectSlug: string
}) {
  const [creating, setCreating] = useState(false)
  const [retryJob, setRetryJob] = useState<ImportRecord | null>(null)

  const { data: imports = [], isLoading } = useQuery({
    queryKey: importsQueryKey(projectId),
    queryFn: () => listImports({ data: { projectId } }),
    refetchInterval: (query) => {
      const rows = query.state.data ?? []
      return rows.some((j) => j.status === "created" || j.status === "queued" || j.status === "running") ? 3000 : false
    },
  })

  return (
    <div className="flex flex-1 flex-col gap-4">
      {isLoading ? null : imports.length === 0 ? (
        <BlankSlate
          icon={Download}
          title="No imports yet"
          description="Bring historical traces from Langfuse, LangSmith, or Braintrust into this project."
          action={{
            label: "Import traces",
            icon: Plus,
            onClick: () => setCreating(true),
          }}
        />
      ) : (
        <>
          <div className="flex flex-row justify-end">
            <Button onClick={() => setCreating(true)}>
              <Icon icon={Plus} size="sm" />
              Import traces
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {imports.map((job) => (
              <ImportJobCard
                key={job.id}
                job={job}
                projectId={projectId}
                onRetry={(retried) => {
                  setRetryJob(retried)
                  setCreating(true)
                }}
              />
            ))}
          </div>
        </>
      )}

      {creating ? (
        <ImportWizardModal
          projectId={projectId}
          {...(retryJob ? { retryJob } : {})}
          onClose={() => {
            setCreating(false)
            setRetryJob(null)
          }}
        />
      ) : null}
    </div>
  )
}
