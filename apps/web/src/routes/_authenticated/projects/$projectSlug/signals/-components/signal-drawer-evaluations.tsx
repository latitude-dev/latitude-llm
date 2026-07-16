import { DEFAULT_EVALUATION_SAMPLING } from "@domain/evaluations"
import {
  Button,
  CloseTrigger,
  Icon,
  Modal,
  Skeleton,
  Slider,
  Status,
  Text,
  Tooltip,
  useMountEffect,
  useToast,
} from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useNavigate, useParams } from "@tanstack/react-router"
import { PencilIcon, RotateCwIcon, ShieldCheckIcon, Trash2Icon, TriangleAlertIcon, XIcon } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import {
  type EvaluationSummaryRecord,
  getSignalAlignmentState,
  monitorSignal,
  type SignalAlignmentStateRecord,
  unmonitorSignal,
  updateSignalEvaluationSampling,
} from "../../../../../../domains/evaluations/evaluation-alignment.functions.ts"
import {
  invalidateSignalQueries,
  useDeleteSignal,
  useSignalDetail,
} from "../../../../../../domains/signals/signals.collection.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler } from "../../../../../../lib/form-server-action.ts"
import { FlaggerBadge } from "../../-components/flaggers/flagger-badge.tsx"
import { AlignmentStatsModal } from "./alignment-stats-modal.tsx"
import { type SignalBuilderDetector, SignalBuilderModal } from "./builder/signal-builder-modal.tsx"
import { formatPercent, getAlignmentVariant } from "./signal-formatters.ts"

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
  const alignment = evaluation.alignment
  if (!alignment) return null
  const confusionMatrix = alignment.confusionMatrix

  return (
    <div className="flex flex-col">
      {evaluation.alignedAt ? (
        <Text.H6 color="foregroundMuted">Aligned at {new Date(evaluation.alignedAt).toLocaleString()}</Text.H6>
      ) : null}
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

function SamplingModal({
  evaluation,
  projectId,
  signalId,
  onClose,
}: {
  readonly evaluation: EvaluationSummaryRecord | null
  readonly projectId: string
  readonly signalId: string
  readonly onClose: () => void
}) {
  if (evaluation === null) return null
  return <SamplingModalForm evaluation={evaluation} projectId={projectId} signalId={signalId} onClose={onClose} />
}

function SamplingModalForm({
  evaluation,
  projectId,
  signalId,
  onClose,
}: {
  readonly evaluation: EvaluationSummaryRecord
  readonly projectId: string
  readonly signalId: string
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const form = useForm({
    defaultValues: {
      sampling: evaluation.trigger.sampling,
    },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        await updateSignalEvaluationSampling({
          data: {
            projectId,
            signalId,
            evaluationId: evaluation.id,
            sampling: value.sampling,
          },
        })
      },
      {
        onSuccess: async () => {
          onClose()
          await invalidateSignalQueries(projectId, signalId)
          toast({ description: "Sampling updated." })
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <Modal
      open
      dismissible
      scrollable={false}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title="Change sampling rate"
      description="Percentage of incoming traces this evaluation runs against."
      footer={
        <>
          <CloseTrigger />
          <Button type="submit" onClick={() => void form.handleSubmit()} isLoading={form.state.isSubmitting}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="sampling">
          {(field) => (
            <div className="flex flex-col gap-3 pb-6">
              <div className="flex items-baseline justify-between">
                <Text.H6 color="foregroundMuted">Sampling</Text.H6>
                <Text.H4M color="foreground">{field.state.value}%</Text.H4M>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[field.state.value]}
                onValueChange={(values) => field.handleChange(values[0] ?? 0)}
              />
              <Text.H6 color="foregroundMuted">
                {field.state.value === 0
                  ? "0% pauses this evaluation."
                  : `Evaluates ${field.state.value}% of incoming traces.`}
              </Text.H6>
            </div>
          )}
        </form.Field>
      </form>
    </Modal>
  )
}

const toTracked = (state: SignalAlignmentStateRecord): TrackedWorkflow | null => {
  if (state.kind === "generating") {
    return { kind: "initial" }
  }

  if (state.kind === "realigning") {
    return { kind: "realign", evaluationId: state.evaluationId }
  }

  return null
}

function AlignmentFailureNote({
  phase,
  reason,
}: {
  readonly phase: "generate" | "realign"
  readonly reason: string | null
}) {
  return (
    <div className="flex w-full items-start gap-2 px-1">
      <Icon icon={TriangleAlertIcon} size="sm" color="destructive" className="shrink-0" />
      <Text.H6 color="destructive">
        {reason || `The ${phase === "generate" ? "generation" : "realignment"} failed for an unknown reason`}
      </Text.H6>
    </div>
  )
}

export function SignalDrawerEvaluations({
  projectId,
  signalId,
  signalSource,
  signalOrigin,
  evaluations,
  flaggerSlugs,
  canMonitorSignal,
  isSignalLoading,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly signalSource: "annotation" | "custom" | "flagger"
  readonly signalOrigin: "user" | "system"
  readonly evaluations: readonly EvaluationSummaryRecord[]
  readonly flaggerSlugs?: readonly string[]
  readonly canMonitorSignal: boolean
  readonly isSignalLoading: boolean
}) {
  const { toast } = useToast()
  const { projectSlug } = useParams({ strict: false })
  const navigate = useNavigate()
  const deleteSignal = useDeleteSignal(projectId)
  const { data: signalDetail } = useSignalDetail({ projectId, signalId })
  const [tracked, setTracked] = useState<TrackedWorkflow | null>(null)
  const [alignmentState, setAlignmentState] = useState<SignalAlignmentStateRecord | null>(null)
  const [monitorModalOpen, setMonitorModalOpen] = useState(false)
  const [realignEvaluationId, setRealignEvaluationId] = useState<string | null>(null)
  const [deleteEvaluationId, setDeleteEvaluationId] = useState<string | null>(null)
  const [statsEvaluation, setStatsEvaluation] = useState<EvaluationSummaryRecord | null>(null)
  const [samplingEvaluation, setSamplingEvaluation] = useState<EvaluationSummaryRecord | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [deleteSignalOpen, setDeleteSignalOpen] = useState(false)
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
    trackedRef.current = null
    setTracked(null)
    setAlignmentState(null)
    setHasAlignmentStateSynced(false)

    const poll = async () => {
      try {
        const state = await getSignalAlignmentState({
          data: { projectId, signalId },
        })

        if (cancelled || !mountedRef.current) {
          return
        }

        const next = toTracked(state)
        const previous = trackedRef.current

        if (previous !== null && next === null) {
          await invalidateSignalQueries(projectId, signalId)
          if (state.kind === "failed") {
            toast({
              variant: "destructive",
              title: previous.kind === "initial" ? "Evaluation generation failed" : "Evaluation realignment failed",
              description: state.reason ?? "The workflow failed for an unknown reason.",
            })
          } else {
            toast({
              description:
                previous.kind === "initial" ? "An evaluation has been generated" : "An evaluation has been realigned",
            })
          }
        }

        setTracked(next)
        setAlignmentState(state)
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
  }, [projectId, signalId, toast])

  const handleGenerate = async () => {
    setIsStartingGenerate(true)
    try {
      const { evaluationId } = await monitorSignal({
        data: { projectId, signalId },
      })
      setTracked(evaluationId ? { kind: "realign", evaluationId } : { kind: "initial" })
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

  const handleRealign = async (_evaluationId: string) => {
    setIsStartingRealign(true)
    try {
      const { evaluationId } = await monitorSignal({
        data: { projectId, signalId },
      })
      setTracked(evaluationId ? { kind: "realign", evaluationId } : { kind: "initial" })
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
      await unmonitorSignal({
        data: { projectId, signalId },
      })
      await invalidateSignalQueries(projectId, signalId)
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

  const handleDeleteSignal = async () => {
    setIsDeleting(true)
    try {
      await deleteSignal.mutateAsync(signalId)
      toast({ description: "Signal deleted." })
      setDeleteSignalOpen(false)
      void navigate({
        to: "/projects/$projectSlug/signals",
        params: { projectSlug: projectSlug ?? "" },
      })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
      setIsDeleting(false)
    }
  }

  const isBusy = tracked !== null
  const alignmentFailure = alignmentState?.kind === "failed" ? alignmentState : null
  const visibleEvaluations = evaluations.filter(
    (evaluation) => evaluation.archivedAt === null && evaluation.deletedAt === null,
  )
  const primaryEvaluation = visibleEvaluations[0] ?? null
  const hiddenEvaluationCount = Math.max(0, visibleEvaluations.length - 1)
  // System-origin evaluations are annotation-aligned, so realign/remove apply.
  // User-origin evaluations come from a raw API/MCP script or declarative settings
  // and cannot be realigned (no annotations) — the signal owns its evaluation.
  const isUserOriginEvaluation = signalOrigin === "user"
  // User-origin evaluations are editable in the builder either as a settings form (Rules/LLM) or, when
  // they have no settings, as the raw script (Advanced tab). System-origin evaluations are not edited here.
  const editableDetector: SignalBuilderDetector | null =
    isUserOriginEvaluation && primaryEvaluation
      ? primaryEvaluation.settings
        ? { kind: "settings", settings: primaryEvaluation.settings }
        : { kind: "script", script: primaryEvaluation.script }
      : null
  const isActionPending = isBusy || isStartingGenerate || isStartingRealign || isDeleting
  const monitorBlockedByLifecycle = !canMonitorSignal
  const isGenerating = isStartingGenerate || tracked?.kind === "initial"
  const isPrimaryEvaluationRealigning =
    primaryEvaluation !== null && tracked?.kind === "realign" && tracked.evaluationId === primaryEvaluation.id

  if (!hasAlignmentStateSynced || isSignalLoading) {
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

  if (visibleEvaluations.length === 0 && isUserOriginEvaluation) {
    return (
      <div className="flex w-full items-start gap-3 rounded-lg border border-dashed border-border px-5 py-4">
        <Icon icon={ShieldCheckIcon} size="md" color="foregroundMuted" />
        <div className="flex min-w-0 flex-col gap-1">
          <Text.H5M>Custom signal</Text.H5M>
          <Text.H6 color="foregroundMuted">This signal has no active evaluation.</Text.H6>
        </div>
      </div>
    )
  }

  if (visibleEvaluations.length === 0 && signalSource === "flagger") {
    const hasFlaggers = flaggerSlugs !== undefined && flaggerSlugs.length > 0
    return (
      <div className="flex w-full items-start gap-3 rounded-lg border border-dashed border-border px-5 py-4">
        <Icon icon={ShieldCheckIcon} size="md" color="foregroundMuted" />
        <div className="flex min-w-0 flex-col gap-1">
          <Text.H5M>Automatically evaluated</Text.H5M>
          <Text.H6 color="foregroundMuted">
            {hasFlaggers
              ? "This signal is automatically evaluated by:"
              : "This signal is automatically evaluated by the system"}
          </Text.H6>
          {hasFlaggers ? (
            <div className="flex flex-wrap items-center gap-1 pt-1">
              {flaggerSlugs.map((slug) => (
                <FlaggerBadge key={slug} projectId={projectId} projectSlug={projectSlug} slug={slug} />
              ))}
            </div>
          ) : null}
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
        {isGenerating ? "Generating" : "Generate evaluation"}
      </Button>
    )

    return (
      <>
        <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-border px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <Text.H5M>No evaluations</Text.H5M>
            <Text.H6 color="foregroundMuted">Generate an evaluation for this signal</Text.H6>
          </div>
          {monitorBlockedByLifecycle ? (
            <Tooltip asChild trigger={<span className="inline-flex">{monitorButton}</span>}>
              <Text.H6 color="foregroundMuted">Unresolve or unignore this signal first to generate an evaluation</Text.H6>
            </Tooltip>
          ) : (
            monitorButton
          )}
        </div>
        {alignmentFailure?.phase === "generate" ? (
          <AlignmentFailureNote phase="generate" reason={alignmentFailure.reason} />
        ) : null}
        <Modal
          open={monitorModalOpen}
          onOpenChange={setMonitorModalOpen}
          dismissible
          title="Generate evaluation"
          description="We'll use the latest traces and any related human annotations to build an evaluation that matches this signal. This can take a moment."
          footer={
            <>
              <CloseTrigger />
              <Button onClick={() => void handleGenerate()} disabled={isActionPending} isLoading={isStartingGenerate}>
                {isStartingGenerate ? "Generating" : "Generate"}
              </Button>
            </>
          }
        />
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
                primaryEvaluation.alignment ? (
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
                      onOpenStats={() => setStatsEvaluation(primaryEvaluation)}
                    />
                  </Tooltip>
                ) : (
                  <Text.H6 color="foregroundMuted">Not aligned</Text.H6>
                )
              }
            />
            <SummaryField
              label="Sampling"
              value={
                // User signals edit sampling in the builder, so the detail page shows it read-only;
                // system signals (no builder) keep the inline click-to-change control.
                isUserOriginEvaluation ? (
                  <Text.H5 color="foreground">{formatPercent(primaryEvaluation.trigger.sampling / 100)}</Text.H5>
                ) : (
                  <Tooltip
                    asChild
                    trigger={
                      <button
                        type="button"
                        onClick={() => setSamplingEvaluation(primaryEvaluation)}
                        disabled={isActionPending}
                        className="inline-flex h-5 cursor-pointer items-center gap-1 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Text.H5 color="foreground">{formatPercent(primaryEvaluation.trigger.sampling / 100)}</Text.H5>
                        <Icon icon={PencilIcon} size="xs" color="foregroundMuted" />
                      </button>
                    }
                  >
                    <Text.H6 color="foregroundMuted">
                      Click to change. We evaluate this signal on{" "}
                      {formatPercent(primaryEvaluation.trigger.sampling / 100)} of the incoming traces.
                    </Text.H6>
                  </Tooltip>
                )
              }
            />
            {!isUserOriginEvaluation ? (
              <div className="flex min-w-0 flex-1 items-end justify-end gap-x-1">
                <Tooltip
                  asChild
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-foreground group-hover:text-secondary-foreground/80"
                      onClick={() => setDeleteEvaluationId(primaryEvaluation.id)}
                      disabled={isActionPending}
                      aria-label="Remove evaluation"
                    >
                      <Icon icon={XIcon} size="sm" />
                    </Button>
                  }
                >
                  <Text.H6 color="foregroundMuted">Remove evaluation</Text.H6>
                </Tooltip>
                <Button
                  variant="outline"
                  onClick={() => setRealignEvaluationId(primaryEvaluation.id)}
                  disabled={isActionPending}
                  isLoading={isPrimaryEvaluationRealigning}
                >
                  <Icon icon={RotateCwIcon} size="sm" />
                  {isPrimaryEvaluationRealigning ? "Realigning" : "Realign evaluation"}
                </Button>
              </div>
            ) : editableDetector !== null ? (
              <div className="flex min-w-0 flex-1 items-end justify-end gap-x-1">
                <Tooltip
                  asChild
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteSignalOpen(true)}
                      disabled={isActionPending}
                      aria-label="Delete signal"
                    >
                      <Icon icon={Trash2Icon} size="sm" />
                    </Button>
                  }
                >
                  <Text.H6 color="foregroundMuted">Delete signal</Text.H6>
                </Tooltip>
                <Button variant="outline" onClick={() => setBuilderOpen(true)} disabled={isActionPending}>
                  <Icon icon={PencilIcon} size="sm" />
                  Edit
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {alignmentFailure?.phase === "realign" ? (
          <AlignmentFailureNote phase="realign" reason={alignmentFailure.reason} />
        ) : null}
        {hiddenEvaluationCount > 0 ? (
          <Text.H6 className="self-center text-center" color="foregroundMuted">
            {hiddenEvaluationCount} other evaluation
            {hiddenEvaluationCount === 1 ? "" : "s"} hidden from this view
          </Text.H6>
        ) : null}
      </div>

      <Modal
        open={realignEvaluationId !== null}
        onOpenChange={(open) => (!open ? setRealignEvaluationId(null) : undefined)}
        dismissible
        title="Realign evaluation"
        description="We periodically realign evaluations to the latest traces to keep them current. You can also realign on demand. This can take a moment."
        footer={
          <>
            <CloseTrigger />
            <Button
              onClick={() => (realignEvaluationId ? void handleRealign(realignEvaluationId) : undefined)}
              disabled={realignEvaluationId === null || isActionPending}
              isLoading={isStartingRealign}
            >
              <Icon icon={RotateCwIcon} size="sm" />
              {isStartingRealign ? "Realigning" : "Realign"}
            </Button>
          </>
        }
      />

      <Modal
        open={deleteEvaluationId !== null}
        onOpenChange={(open) => (!open ? setDeleteEvaluationId(null) : undefined)}
        dismissible
        title="Remove evaluation"
        description="Are you sure you want to remove this signal's evaluation? You can generate a new one anytime."
        footer={
          <>
            <CloseTrigger />
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={isDeleting}>
              <Icon icon={XIcon} size="sm" />
              Remove
            </Button>
          </>
        }
      />

      <AlignmentStatsModal evaluation={statsEvaluation} onClose={() => setStatsEvaluation(null)} />

      <SamplingModal
        evaluation={samplingEvaluation}
        projectId={projectId}
        signalId={signalId}
        onClose={() => setSamplingEvaluation(null)}
      />

      {builderOpen && editableDetector !== null ? (
        <SignalBuilderModal
          projectId={projectId}
          projectSlug={projectSlug ?? ""}
          mode="edit"
          initial={{
            signalId,
            filters: signalDetail?.filters ?? null,
            detector: editableDetector,
            sampling: primaryEvaluation?.trigger.sampling ?? DEFAULT_EVALUATION_SAMPLING,
          }}
          onClose={() => setBuilderOpen(false)}
        />
      ) : null}

      <Modal
        open={deleteSignalOpen}
        onOpenChange={(open) => (!open ? setDeleteSignalOpen(false) : undefined)}
        dismissible
        title="Delete signal"
        description="Are you sure you want to delete this signal? This also archives its evaluation. This cannot be undone."
        footer={
          <>
            <CloseTrigger />
            <Button variant="destructive" onClick={() => void handleDeleteSignal()} disabled={isDeleting}>
              <Icon icon={Trash2Icon} size="sm" />
              Delete
            </Button>
          </>
        }
      />
    </>
  )
}
