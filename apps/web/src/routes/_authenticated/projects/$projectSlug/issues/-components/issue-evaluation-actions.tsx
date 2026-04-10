import { Button, Icon, Text, useMountEffect, useToast } from "@repo/ui"
import { Plus, RotateCw } from "lucide-react"
import { useRef, useState } from "react"
import {
  type EvaluationAlignmentJobStatusRecord,
  type EvaluationSummaryRecord,
  getEvaluationAlignmentJobStatus,
  startEvaluationAlignment,
  triggerManualEvaluationRealignment,
} from "../../../../../../domains/evaluations/evaluation-alignment.functions.ts"
import { invalidateIssueQueries } from "../../../../../../domains/issues/issues.collection.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { EvaluationAlignmentStatus } from "./evaluation-alignment-status.tsx"

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

export function IssueEvaluationActions({
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
        await invalidateIssueQueries(projectId)
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

  const isBusy = activeJob !== null && !isTerminalStatus(activeJob.status.status)

  if (evaluations.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Text.H5M>No linked evaluations</Text.H5M>
          <EvaluationAlignmentStatus jobStatus={activeJob?.kind === "initial" ? activeJob.status : null} />
        </div>
        <Button onClick={handleGenerate} disabled={isBusy} isLoading={activeJob?.kind === "initial" && isBusy}>
          <Icon icon={Plus} size="sm" />
          Generate evaluation
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {evaluations.map((evaluation) => (
        <div key={evaluation.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Text.H5M ellipsis>{evaluation.name}</Text.H5M>
            <Text.H6 color="foregroundMuted">{evaluation.description}</Text.H6>
            <EvaluationAlignmentStatus
              evaluation={evaluation}
              jobStatus={
                activeJob?.kind === "realign" && activeJob.evaluationId === evaluation.id ? activeJob.status : null
              }
            />
          </div>
          <Button
            variant="outline"
            onClick={() => handleRealign(evaluation.id)}
            disabled={isBusy}
            isLoading={activeJob?.kind === "realign" && activeJob.evaluationId === evaluation.id && isBusy}
          >
            <Icon icon={RotateCw} size="sm" />
            Realign
          </Button>
        </div>
      ))}
    </div>
  )
}
