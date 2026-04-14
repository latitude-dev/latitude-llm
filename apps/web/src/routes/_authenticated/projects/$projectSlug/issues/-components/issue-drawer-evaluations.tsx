import { Button, CloseTrigger, Icon, Modal, Status, Text, Tooltip, useMountEffect, useToast } from "@repo/ui"
import { BellPlusIcon, RotateCwIcon, XIcon } from "lucide-react"
import { type ComponentProps, type ReactNode, useRef, useState } from "react"
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

function SummaryField({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {value}
    </div>
  )
}

function getAlignmentVariant(score: number): NonNullable<ComponentProps<typeof Status>["variant"]> {
  if (score < 0.5) {
    return "destructive"
  }

  if (score < 0.75) {
    return "warning"
  }

  return "success"
}

function AlignmentTooltipContent({ evaluation }: { readonly evaluation: EvaluationSummaryRecord }) {
  const confusionMatrix = evaluation.alignment.confusionMatrix

  return (
    <div className="flex flex-col gap-2">
      <Text.H6 color="foregroundMuted">Alignment is computed as the Matthews Correlation Coefficient</Text.H6>
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-[auto_auto_auto]">
          <div aria-hidden className="border-b border-r border-border px-2 py-1" />
          <div className="border-b border-r border-border px-2 py-1">
            <Text.H6 color="foregroundMuted">Predicted +</Text.H6>
          </div>
          <div className="border-b border-border px-2 py-1">
            <Text.H6 color="foregroundMuted">Predicted -</Text.H6>
          </div>

          <div className="border-b border-r border-border px-2 py-1">
            <Text.H6 color="foregroundMuted">Actual +</Text.H6>
          </div>
          <div className="border-b border-r border-border px-2 py-1">
            <Text.H6B>{confusionMatrix.truePositives}</Text.H6B>
          </div>
          <div className="border-b border-border px-2 py-1">
            <Text.H6B>{confusionMatrix.falseNegatives}</Text.H6B>
          </div>

          <div className="border-r border-border px-2 py-1">
            <Text.H6 color="foregroundMuted">Actual -</Text.H6>
          </div>
          <div className="border-r border-border px-2 py-1">
            <Text.H6B>{confusionMatrix.falsePositives}</Text.H6B>
          </div>
          <div className="px-2 py-1">
            <Text.H6B>{confusionMatrix.trueNegatives}</Text.H6B>
          </div>
        </div>
      </div>
    </div>
  )
}

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
  const [realignEvaluationId, setRealignEvaluationId] = useState<string | null>(null)
  const [archiveEvaluationId, setArchiveEvaluationId] = useState<string | null>(null)
  const [isStartingRealign, setIsStartingRealign] = useState(false)
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
    setIsStartingRealign(true)
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
      setRealignEvaluationId(null)
      void syncJobStatus(job)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setIsStartingRealign(false)
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
  const visibleEvaluations = evaluations.filter(
    (evaluation) => evaluation.archivedAt === null && evaluation.deletedAt === null,
  )
  const primaryEvaluation = visibleEvaluations[0] ?? null
  const hiddenEvaluationCount = Math.max(0, visibleEvaluations.length - 1)
  const isActionPending = isBusy || isStartingRealign || isArchiving

  if (visibleEvaluations.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 border border-dashed border-border rounded-lg px-5 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Text.H5M>No evaluations</Text.H5M>
          <Text.H6 color="foregroundMuted">Generate an evaluation to monitor this issue</Text.H6>
        </div>
        <Button onClick={handleGenerate} disabled={isActionPending} isLoading={activeJob?.kind === "initial" && isBusy}>
          <Icon icon={BellPlusIcon} size="sm" />
          Monitor
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {primaryEvaluation ? (
          <div className="flex flex-row flex-wrap items-end gap-8">
            <SummaryField
              label="Alignment"
              value={
                <Tooltip
                  asChild
                  trigger={
                    <span className="inline-flex">
                      <button
                        type="button"
                        className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                        onClick={() => setRealignEvaluationId(primaryEvaluation.id)}
                        disabled={isActionPending}
                        aria-label={`Realign ${primaryEvaluation.name}`}
                      >
                        <Status
                          variant={getAlignmentVariant(
                            primaryEvaluation.alignment.metrics.matthewsCorrelationCoefficient,
                          )}
                          label={formatPercent(primaryEvaluation.alignment.metrics.matthewsCorrelationCoefficient)}
                          indicator={
                            <Icon
                              icon={RotateCwIcon}
                              size="xs"
                              className={
                                activeJob?.kind === "realign" &&
                                activeJob.evaluationId === primaryEvaluation.id &&
                                !isTerminalStatus(activeJob.status.status)
                                  ? "shrink-0 animate-spin stroke-[2.5]"
                                  : "shrink-0 stroke-[2.5]"
                              }
                            />
                          }
                        />
                      </button>
                    </span>
                  }
                >
                  <AlignmentTooltipContent evaluation={primaryEvaluation} />
                </Tooltip>
              }
            />
            <SummaryField
              label="Sampling"
              value={<Text.H5 color="foreground">{formatPercent(primaryEvaluation.trigger.sampling / 100)}</Text.H5>}
            />
            <div className="flex shrink-0 items-end">
              <Button
                variant="ghost"
                className="text-foreground group-hover:text-secondary-foreground/80"
                onClick={() => setArchiveEvaluationId(primaryEvaluation.id)}
                disabled={isActionPending}
              >
                <Icon icon={XIcon} size="sm" />
                Unmonitor
              </Button>
            </div>
          </div>
        ) : null}
        {hiddenEvaluationCount > 0 ? (
          <Text.H6 className="self-center text-center" color="foregroundMuted">
            {hiddenEvaluationCount} more evaluation{hiddenEvaluationCount === 1 ? "" : "s"} hidden from this view
          </Text.H6>
        ) : null}
      </div>

      <Modal.Root
        open={realignEvaluationId !== null}
        onOpenChange={(open) => (!open ? setRealignEvaluationId(null) : undefined)}
      >
        <Modal.Content dismissible>
          <Modal.Header
            title="Realign evaluation"
            description="We realign evaluations to the latest traces periodically to ensure they are up to date. You can realign this evaluation on demand. This may take some time."
          />
          <Modal.Footer>
            <CloseTrigger />
            <Button
              onClick={() => (realignEvaluationId ? void handleRealign(realignEvaluationId) : undefined)}
              disabled={realignEvaluationId === null || isActionPending}
              isLoading={isStartingRealign}
            >
              <Icon icon={RotateCwIcon} size="sm" />
              Realign
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>

      <Modal.Root
        open={archiveEvaluationId !== null}
        onOpenChange={(open) => (!open ? setArchiveEvaluationId(null) : undefined)}
      >
        <Modal.Content dismissible>
          <Modal.Header
            title="Unmonitor evaluation"
            description="Are you sure you want to archive the evaluation monitoring this issue? You can generate a new evaluation to monitor this issue at any time."
          />
          <Modal.Footer>
            <CloseTrigger />
            <Button variant="destructive" onClick={() => void handleArchive()} disabled={isArchiving}>
              <Icon icon={XIcon} size="sm" />
              Unmonitor
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
