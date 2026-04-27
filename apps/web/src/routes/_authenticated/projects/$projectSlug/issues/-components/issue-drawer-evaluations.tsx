import { Button, CloseTrigger, Icon, Modal, Skeleton, Status, Text, Tooltip, useMountEffect, useToast } from "@repo/ui"
import { BellPlusIcon, RotateCwIcon, ShieldCheckIcon, XIcon } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import {
  type EvaluationSummaryRecord,
  getIssueAlignmentState,
  type IssueAlignmentStateRecord,
  softDeleteIssueEvaluation,
  startEvaluationAlignment,
  triggerManualEvaluationRealignment,
} from "../../../../../../domains/evaluations/evaluation-alignment.functions.ts"
import { invalidateIssueQueries } from "../../../../../../domains/issues/issues.collection.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { AlignmentStatsModal } from "./alignment-stats-modal.tsx"
import { formatPercent, getAlignmentVariant } from "./issue-formatters.ts"

const POLL_INTERVAL_MS = 5000

type TrackedWorkflow = { readonly kind: "initial" } | { readonly kind: "realign"; readonly evaluationId: string }

function SummaryField({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {value}
    </div>
  )
}

function AlignmentTooltipContent({
  evaluation,
  onOpenStats,
}: {
  readonly evaluation: EvaluationSummaryRecord
  readonly onOpenStats: () => void
}) {
  const confusionMatrix = evaluation.alignment.confusionMatrix

  return (
    <div className="flex flex-col">
      <Text.H6 color="foregroundMuted">Aligned at {new Date(evaluation.alignedAt).toLocaleString()}</Text.H6>
      <Button
        variant="link"
        className="w-auto h-auto p-0"
        onClick={(event) => {
          event.stopPropagation()
          onOpenStats()
        }}
      >
        <Text.H6 color="accentForeground">Advanced statistics</Text.H6>
      </Button>
      <div className="flex flex-col gap-1 pt-1">
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
            <Text.H6B color="success">{confusionMatrix.truePositives}</Text.H6B>
          </div>
          <div className="border-b border-border px-2 py-1">
            <Text.H6B color="destructive">{confusionMatrix.falseNegatives}</Text.H6B>
          </div>

          <div className="border-r border-border px-2 py-1">
            <Text.H6 color="foregroundMuted">Actual -</Text.H6>
          </div>
          <div className="border-r border-border px-2 py-1">
            <Text.H6B color="destructive">{confusionMatrix.falsePositives}</Text.H6B>
          </div>
          <div className="px-2 py-1">
            <Text.H6B color="success">{confusionMatrix.trueNegatives}</Text.H6B>
          </div>
        </div>
      </div>
    </div>
  )
}

const toTracked = (state: IssueAlignmentStateRecord): TrackedWorkflow | null => {
  if (state.kind === "generating") {
    return { kind: "initial" }
  }

  if (state.kind === "realigning") {
    return { kind: "realign", evaluationId: state.evaluationId }
  }

  return null
}

export function IssueDrawerEvaluations({
  projectId,
  issueId,
  issueSource,
  evaluations,
  canMonitorIssue,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly issueSource: "annotation" | "custom" | "flagger"
  readonly evaluations: readonly EvaluationSummaryRecord[]
  readonly canMonitorIssue: boolean
}) {
  const { toast } = useToast()
  const [tracked, setTracked] = useState<TrackedWorkflow | null>(null)
  const [monitorModalOpen, setMonitorModalOpen] = useState(false)
  const [realignEvaluationId, setRealignEvaluationId] = useState<string | null>(null)
  const [deleteEvaluationId, setDeleteEvaluationId] = useState<string | null>(null)
  const [statsEvaluationId, setStatsEvaluationId] = useState<string | null>(null)
  const [isStartingGenerate, setIsStartingGenerate] = useState(false)
  const [isStartingRealign, setIsStartingRealign] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [hasAlignmentStateSynced, setHasAlignmentStateSynced] = useState(false)
  const mountedRef = useRef(true)
  const trackedRef = useRef<TrackedWorkflow | null>(null)

  trackedRef.current = tracked

  useMountEffect(() => {
    return () => {
      mountedRef.current = false
    }
  })

  useEffect(() => {
    let cancelled = false
    mountedRef.current = true
    setHasAlignmentStateSynced(false)

    const poll = async () => {
      try {
        const state = await getIssueAlignmentState({
          data: { projectId, issueId },
        })

        if (cancelled || !mountedRef.current) {
          return
        }

        const next = toTracked(state)
        const previous = trackedRef.current

        if (previous !== null && next === null) {
          await invalidateIssueQueries(projectId, issueId)
          toast({
            description:
              previous.kind === "initial" ? "An evaluation has been generated" : "An evaluation has been realigned",
          })
        }

        setTracked(next)
        setHasAlignmentStateSynced(true)
      } catch {
        // Transient failures keep the last known state until the next tick.
      }
    }

    void poll()
    const intervalId = setInterval(() => void poll(), POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [projectId, issueId, toast])

  const handleGenerate = async () => {
    setIsStartingGenerate(true)
    try {
      await startEvaluationAlignment({
        data: { projectId, issueId },
      })
      setTracked({ kind: "initial" })
      setMonitorModalOpen(false)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setIsStartingGenerate(false)
    }
  }

  const handleRealign = async (evaluationId: string) => {
    setIsStartingRealign(true)
    try {
      await triggerManualEvaluationRealignment({
        data: { projectId, issueId, evaluationId },
      })
      setTracked({ kind: "realign", evaluationId })
      setRealignEvaluationId(null)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setIsStartingRealign(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteEvaluationId) {
      return
    }

    setIsDeleting(true)
    try {
      await softDeleteIssueEvaluation({
        data: {
          projectId,
          issueId,
          evaluationId: deleteEvaluationId,
        },
      })
      await invalidateIssueQueries(projectId, issueId)
      toast({ description: "Evaluation removed." })
      setDeleteEvaluationId(null)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const isBusy = tracked !== null
  const visibleEvaluations = evaluations.filter(
    (evaluation) => evaluation.archivedAt === null && evaluation.deletedAt === null,
  )
  const primaryEvaluation = visibleEvaluations[0] ?? null
  const hiddenEvaluationCount = Math.max(0, visibleEvaluations.length - 1)
  const isActionPending = isBusy || isStartingGenerate || isStartingRealign || isDeleting
  const monitorBlockedByLifecycle = !canMonitorIssue
  const isGenerating = isStartingGenerate || tracked?.kind === "initial"
  const isPrimaryEvaluationRealigning =
    primaryEvaluation !== null && tracked?.kind === "realign" && tracked.evaluationId === primaryEvaluation.id

  if (!hasAlignmentStateSynced) {
    return visibleEvaluations.length === 0 ? (
      <Skeleton className="h-20 w-full rounded-xl" />
    ) : (
      <div aria-busy className="flex w-full flex-col justify-center gap-2 px-1 pt-2">
        <div className="flex flex-row flex-wrap items-end gap-8">
          <div className="flex shrink-0 flex-col gap-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-12" />
          </div>
          <div className="flex min-w-0 flex-1 flex-row flex-wrap justify-end gap-1">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        {hiddenEvaluationCount > 0 ? <Skeleton className="h-4 w-48 self-center" /> : null}
      </div>
    )
  }

  if (visibleEvaluations.length === 0 && issueSource === "flagger") {
    return (
      <div className="flex w-full items-start gap-3 rounded-lg border border-dashed border-border px-5 py-4">
        <Icon icon={ShieldCheckIcon} size="md" color="foregroundMuted" />
        <div className="flex min-w-0 flex-col gap-1">
          <Text.H5M>Automatically monitored</Text.H5M>
          <Text.H6 color="foregroundMuted">
            This issue is already monitored on every trace, so a separate evaluation is not needed.
          </Text.H6>
        </div>
      </div>
    )
  }

  if (visibleEvaluations.length === 0) {
    const monitorButton = (
      <Button
        onClick={() => setMonitorModalOpen(true)}
        disabled={isActionPending || monitorBlockedByLifecycle}
        isLoading={isGenerating}
      >
        <Icon icon={BellPlusIcon} size="sm" />
        {isGenerating ? "Generating" : "Monitor"}
      </Button>
    )

    return (
      <>
        <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-border px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <Text.H5M>No evaluations</Text.H5M>
            <Text.H6 color="foregroundMuted">Generate an evaluation to monitor this issue</Text.H6>
          </div>
          {monitorBlockedByLifecycle ? (
            <Tooltip asChild trigger={<span className="inline-flex">{monitorButton}</span>}>
              <Text.H6 color="foregroundMuted">
                Unresolve and unignore this issue first to be able to monitor it
              </Text.H6>
            </Tooltip>
          ) : (
            monitorButton
          )}
        </div>
        <Modal.Root open={monitorModalOpen} onOpenChange={setMonitorModalOpen}>
          <Modal.Content dismissible>
            <Modal.Header
              title="Monitor issue"
              description="We will use the latest traces and related human annotations to generate an evaluation aligned to monitor this issue. This may take some time"
            />
            <Modal.Footer>
              <CloseTrigger />
              <Button onClick={() => void handleGenerate()} disabled={isActionPending} isLoading={isStartingGenerate}>
                <Icon icon={BellPlusIcon} size="sm" />
                {isStartingGenerate ? "Generating" : "Monitor"}
              </Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      </>
    )
  }

  return (
    <>
      <div className="flex w-full flex-col gap-2 px-1 pt-2">
        {primaryEvaluation ? (
          <div className="flex flex-row flex-wrap items-end gap-8">
            <SummaryField
              label="Alignment"
              value={
                <Tooltip
                  asChild
                  trigger={
                    <span className="inline-flex">
                      <Status
                        variant={getAlignmentVariant(primaryEvaluation.alignment.metrics.alignmentMetric)}
                        label={formatPercent(primaryEvaluation.alignment.metrics.alignmentMetric)}
                      />
                    </span>
                  }
                >
                  <AlignmentTooltipContent
                    evaluation={primaryEvaluation}
                    onOpenStats={() => setStatsEvaluationId(primaryEvaluation.id)}
                  />
                </Tooltip>
              }
            />
            <SummaryField
              label="Sampling"
              value={
                <Tooltip
                  asChild
                  trigger={
                    <span className="inline-flex">
                      <Text.H5 color="foreground">{formatPercent(primaryEvaluation.trigger.sampling / 100)}</Text.H5>
                    </span>
                  }
                >
                  <Text.H6 color="foregroundMuted">
                    We monitor this issue on {formatPercent(primaryEvaluation.trigger.sampling / 100)} of the incoming
                    traces
                  </Text.H6>
                </Tooltip>
              }
            />
            <div className="flex min-w-0 flex-1 items-end justify-end gap-x-1">
              <Button
                variant="ghost"
                className="text-foreground group-hover:text-secondary-foreground/80"
                onClick={() => setDeleteEvaluationId(primaryEvaluation.id)}
                disabled={isActionPending}
              >
                <Icon icon={XIcon} size="sm" />
                Unmonitor
              </Button>
              <Button
                variant="outline"
                onClick={() => setRealignEvaluationId(primaryEvaluation.id)}
                disabled={isActionPending}
                isLoading={isPrimaryEvaluationRealigning}
              >
                <Icon icon={RotateCwIcon} size="sm" />
                {isPrimaryEvaluationRealigning ? "Realigning" : "Realign"}
              </Button>
            </div>
          </div>
        ) : null}
        {hiddenEvaluationCount > 0 ? (
          <Text.H6 className="self-center text-center" color="foregroundMuted">
            {hiddenEvaluationCount} other evaluation{hiddenEvaluationCount === 1 ? "" : "s"} hidden from this view
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
            description="We realign evaluations to the latest traces periodically to ensure they are up to date. You can realign this evaluation on demand. This may take some time"
          />
          <Modal.Footer>
            <CloseTrigger />
            <Button
              onClick={() => (realignEvaluationId ? void handleRealign(realignEvaluationId) : undefined)}
              disabled={realignEvaluationId === null || isActionPending}
              isLoading={isStartingRealign}
            >
              <Icon icon={RotateCwIcon} size="sm" />
              {isStartingRealign ? "Realigning" : "Realign"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>

      <Modal.Root
        open={deleteEvaluationId !== null}
        onOpenChange={(open) => (!open ? setDeleteEvaluationId(null) : undefined)}
      >
        <Modal.Content dismissible>
          <Modal.Header
            title="Unmonitor issue"
            description="Are you sure you want to remove the evaluation monitoring this issue? You can generate a new evaluation at any time"
          />
          <Modal.Footer>
            <CloseTrigger />
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={isDeleting}>
              <Icon icon={XIcon} size="sm" />
              Unmonitor
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>

      <AlignmentStatsModal
        evaluation={
          statsEvaluationId === null
            ? null
            : (visibleEvaluations.find((evaluation) => evaluation.id === statsEvaluationId) ?? null)
        }
        onClose={() => setStatsEvaluationId(null)}
      />
    </>
  )
}
