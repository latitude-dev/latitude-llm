import { Button, CloseTrigger, Icon, Modal, Text, useMountEffect, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { ArchiveIcon, Plus, RotateCw, XIcon } from "lucide-react"
import { useRef, useState } from "react"
import {
  archiveIssueEvaluation,
  type EvaluationAlignmentJobStatusRecord,
  type EvaluationSummaryRecord,
  getEvaluationAlignmentJobStatus,
  startEvaluationAlignment,
  triggerManualEvaluationRealignment,
} from "../../../../../../domains/evaluations/evaluation-alignment.functions.ts"
import { invalidateIssueQueries } from "../../../../../../domains/issues/issues.collection.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { EvaluationAlignmentStatus } from "./evaluation-alignment-status.tsx"
import { formatPercent } from "./issue-formatters.ts"

const POLL_INTERVAL_MS = 1500

type ActiveAlignmentJob =
  | {
      readonly kind: "initial"
      readonly status: EvaluationAlignmentJobStatusRecord
    }
  | {
      readonly kind: "realign"
      readonly evaluationId: string
      readonly status: EvaluationAlignmentJobStatusRecord
    }

const isTerminalStatus = (status: EvaluationAlignmentJobStatusRecord["status"]) =>
  status === "completed" || status === "failed"

export function IssueDrawerEvaluations({
  projectId,
  issueId,
  evaluations,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly evaluations: readonly EvaluationSummaryRecord[]
}) {
  const { toast } = useToast()
  const [activeJob, setActiveJob] = useState<ActiveAlignmentJob | null>(null)
  const [archiveEvaluationId, setArchiveEvaluationId] = useState<string | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)
  const mountedRef = useRef(true)

  useMountEffect(() => {
    return () => {
      mountedRef.current = false
    }
  })

  const syncJobStatus = async (job: ActiveAlignmentJob) => {
    let currentJob = job

    while (mountedRef.current) {
      const nextStatus = await getEvaluationAlignmentJobStatus({
        data: {
          jobId: currentJob.status.jobId,
        },
      })

      if (!mountedRef.current) {
        return
      }

      currentJob =
        currentJob.kind === "initial"
          ? {
              kind: "initial",
              status: nextStatus,
            }
          : {
              kind: "realign",
              evaluationId: currentJob.evaluationId,
              status: nextStatus,
            }
      setActiveJob(currentJob)

      if (isTerminalStatus(nextStatus.status)) {
        await invalidateIssueQueries(projectId, issueId)
        return
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }

  const handleGenerate = async () => {
    try {
      const status = await startEvaluationAlignment({
        data: {
          projectId,
          issueId,
        },
      })
      const job: ActiveAlignmentJob = {
        kind: "initial",
        status,
      }
      setActiveJob(job)
      void syncJobStatus(job)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    }
  }

  const handleRealign = async (evaluationId: string) => {
    try {
      const status = await triggerManualEvaluationRealignment({
        data: {
          projectId,
          issueId,
          evaluationId,
        },
      })
      const job: ActiveAlignmentJob = {
        kind: "realign",
        evaluationId,
        status,
      }
      setActiveJob(job)
      void syncJobStatus(job)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    }
  }

  const handleArchive = async () => {
    if (!archiveEvaluationId) {
      return
    }

    setIsArchiving(true)
    try {
      await archiveIssueEvaluation({
        data: {
          projectId,
          issueId,
          evaluationId: archiveEvaluationId,
        },
      })
      await invalidateIssueQueries(projectId, issueId)
      toast({ description: "Evaluation archived." })
      setArchiveEvaluationId(null)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setIsArchiving(false)
    }
  }

  const isBusy = activeJob !== null && !isTerminalStatus(activeJob.status.status)
  const archiveTarget = evaluations.find((evaluation) => evaluation.id === archiveEvaluationId) ?? null

  if (evaluations.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Text.H5M>No linked evaluations</Text.H5M>
          <EvaluationAlignmentStatus jobStatus={activeJob?.kind === "initial" ? activeJob.status : null} />
        </div>
        <Button onClick={handleGenerate} disabled={isBusy} isLoading={activeJob?.kind === "initial" && isBusy}>
          <Icon icon={Plus} size="sm" />
          Monitor issue
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {evaluations.map((evaluation) => {
          const isRealigning =
            activeJob?.kind === "realign" &&
            activeJob.evaluationId === evaluation.id &&
            !isTerminalStatus(activeJob.status.status)

          return (
            <div key={evaluation.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Text.H5M ellipsis>{evaluation.name}</Text.H5M>
                  <Text.H6 color="foregroundMuted">
                    {evaluation.archivedAt ? "Archived" : "Active"} · Aligned{" "}
                    {relativeTime(new Date(evaluation.alignedAt))} · MCC{" "}
                    {formatPercent(evaluation.alignment.metrics.matthewsCorrelationCoefficient)}
                  </Text.H6>
                  {isRealigning ? <EvaluationAlignmentStatus jobStatus={activeJob.status} /> : null}
                </div>
                <div className="flex shrink-0 flex-row items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleRealign(evaluation.id)}
                    disabled={isBusy || evaluation.archivedAt !== null}
                    isLoading={isRealigning}
                  >
                    <Icon icon={RotateCw} size="sm" />
                    {isRealigning ? "Aligning..." : "Realign"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setArchiveEvaluationId(evaluation.id)}
                    disabled={evaluation.archivedAt !== null || isArchiving}
                  >
                    <Icon icon={ArchiveIcon} size="sm" />
                    {evaluation.archivedAt ? "Archived" : "Archive"}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Modal.Root
        open={archiveEvaluationId !== null}
        onOpenChange={(open) => (!open ? setArchiveEvaluationId(null) : undefined)}
      >
        <Modal.Content dismissible>
          <Modal.Header
            title="Archive evaluation"
            description={
              archiveTarget
                ? `Archiving ${archiveTarget.name} will stop this issue from being monitored by that evaluation.`
                : "Archive this evaluation?"
            }
          />
          <Modal.Body>
            <div className="flex flex-col gap-2">
              <Text.H6 color="foregroundMuted">
                You can still review the archived evaluation history, but it will no longer actively monitor this issue.
              </Text.H6>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button variant="destructive" onClick={() => void handleArchive()} disabled={isArchiving}>
              <Icon icon={XIcon} size="sm" />
              Archive evaluation
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
