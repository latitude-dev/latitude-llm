import { OutboxEventWriter } from "@domain/events"
import { WorkflowQuerier, WorkflowStarter } from "@domain/queue"
import {
  BadRequestError,
  type EvaluationId,
  generateId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  type SignalId,
  type SignalOrigin,
  type UserId,
} from "@domain/shared"
import { Effect } from "effect"
import { isActiveEvaluation } from "../entities/evaluation.ts"
import { SignalNotActiveForMonitoringError } from "../errors.ts"
import { EvaluationRepository } from "../ports/evaluation-repository.ts"
import { EvaluationSignalRepository } from "../ports/evaluation-signal-repository.ts"

export interface MonitorSignalInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
  /**
   * User who triggered the monitor, recorded on the resulting `EvaluationCreated`
   * or `EvaluationAligned` outbox event. Omit for callers without a real user
   * (e.g. API-key auth) — the event then records a blank actor.
   */
  readonly actorUserId?: UserId
  /**
   * `true` when the issue is monitored by an upstream system (e.g. a flagger)
   * and doesn't need a manual LLM evaluation. When set and no active
   * evaluation exists yet, the use-case rejects the start path with a
   * `BadRequestError`; realigning an already-existing evaluation is still
   * allowed so users who opted into manual monitoring can keep tuning it.
   */
  readonly isAutomaticallyMonitored?: boolean
  /**
   * Origin of the signal. `user`-authored signals manage their own evaluation
   * (a raw script created via the API/MCP) and are never realigned by the LLM
   * optimization workflow, so the use-case rejects them outright — mirroring the
   * UI, which hides realign for user signals. Omit for callers that only ever
   * monitor system signals.
   */
  readonly signalOrigin?: SignalOrigin
}

interface MonitorSignalResult {
  /**
   * Identifier for the monitor job. For new evaluations this is the future
   * evaluation id (and the `evaluationId` field is `null` until the workflow
   * persists the row); for realignments this is a fresh job id.
   */
  readonly jobId: string
  /**
   * The realigned evaluation's id when monitoring an issue that already had
   * an active evaluation. `null` when starting fresh — the workflow creates
   * the evaluation row itself.
   */
  readonly evaluationId: EvaluationId | null
}

export type MonitorSignalError = BadRequestError | RepositoryError | SignalNotActiveForMonitoringError

const buildGenerateWorkflowId = (signalId: string) => `evaluations:generate:${signalId}`
const buildOptimizeWorkflowId = (evaluationId: string) => `evaluations:optimize:${evaluationId}`

/**
 * Starts (or realigns) monitoring for an issue. The use-case auto-detects
 * which path to take based on existing state:
 *
 * - **No active evaluation** → start the generation workflow + write an
 *   `EvaluationCreated` outbox event.
 * - **Existing active evaluation** → realign it (kick off the optimization
 *   workflow against that evaluation's id) + write an `EvaluationAligned`
 *   outbox event.
 *
 * Either way, when the corresponding workflow is already running the call
 * fails with a `BadRequestError` so the UI can surface a friendly message.
 *
 * The signal is loaded through the narrow `EvaluationSignalRepository` view
 * (no `@domain/signals` dependency) to enforce project ownership and reject
 * resolved/ignored signals server-side.
 */
export const monitorSignalUseCase = Effect.fn("evaluations.monitorSignal")(function* (input: MonitorSignalInput) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("signalId", input.signalId)

  if (input.signalOrigin === "user") {
    return yield* new BadRequestError({
      message: "User-authored signals manage their own evaluation and cannot be monitored or realigned",
    })
  }

  // Resolved/ignored signals are archived; attaching or realigning a detector
  // contradicts that state. Checked here (not just in the UI) so the API path
  // enforces it too. A missing signal degrades to the same rejection.
  const signalRepository = yield* EvaluationSignalRepository
  const signal = yield* signalRepository
    .findById(input.signalId)
    .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
  if (
    signal === null ||
    signal.projectId !== input.projectId ||
    signal.resolvedAt !== null ||
    signal.ignoredAt !== null
  ) {
    return yield* new SignalNotActiveForMonitoringError({ signalId: input.signalId })
  }

  const evaluationRepository = yield* EvaluationRepository
  const activeEvaluations = yield* evaluationRepository
    .listBySignalId({ projectId: input.projectId, signalId: input.signalId, options: { lifecycle: "active" } })
    .pipe(Effect.map((page) => page.items.filter(isActiveEvaluation)))

  // Pick the most-recent active evaluation when one exists. Multiple active
  // evaluations per issue are technically possible but unusual; realigning
  // the latest one matches the UI's behavior and keeps the API simple.
  const existing = [...activeEvaluations].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null

  const workflowQuerier = yield* WorkflowQuerier
  const workflowStarter = yield* WorkflowStarter

  if (existing === null) {
    // Start path
    if (input.isAutomaticallyMonitored) {
      return yield* new BadRequestError({
        message: "This issue is automatically monitored and does not need manual monitoring",
      })
    }

    const workflowId = buildGenerateWorkflowId(input.signalId)
    const description = yield* workflowQuerier.describe(workflowId)
    if (description?.status === "running") {
      return yield* new BadRequestError({
        message: "An evaluation is already being generated for this issue",
      })
    }

    const jobId = generateId()
    const billingOperationId = generateId()

    yield* workflowStarter
      .start(
        "optimizeEvaluationWorkflow",
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          signalId: input.signalId,
          evaluationId: null,
          jobId,
          billingOperationId,
        },
        { workflowId },
      )
      .pipe(
        Effect.catchTag("WorkflowAlreadyStartedError", () =>
          Effect.fail(new BadRequestError({ message: "An evaluation is already being generated for this issue" })),
        ),
      )

    const outboxEventWriter = yield* OutboxEventWriter
    yield* outboxEventWriter.write({
      eventName: "EvaluationCreated",
      aggregateType: "evaluation",
      aggregateId: jobId,
      organizationId: input.organizationId,
      payload: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? "",
        projectId: input.projectId,
        evaluationId: jobId,
        signalId: input.signalId,
      },
    })

    return { jobId, evaluationId: null } satisfies MonitorSignalResult
  }

  // Realign path
  const workflowId = buildOptimizeWorkflowId(existing.id)
  const description = yield* workflowQuerier.describe(workflowId)
  if (description?.status === "running") {
    return yield* new BadRequestError({
      message: "This evaluation is already being realigned",
    })
  }

  const jobId = generateId()
  const billingOperationId = generateId()

  yield* workflowStarter
    .start(
      "optimizeEvaluationWorkflow",
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        signalId: input.signalId,
        evaluationId: existing.id,
        jobId,
        billingOperationId,
      },
      { workflowId },
    )
    .pipe(
      Effect.catchTag("WorkflowAlreadyStartedError", () =>
        Effect.fail(new BadRequestError({ message: "This evaluation is already being realigned" })),
      ),
    )

  const outboxEventWriter = yield* OutboxEventWriter
  yield* outboxEventWriter.write({
    eventName: "EvaluationAligned",
    aggregateType: "evaluation",
    aggregateId: existing.id,
    organizationId: input.organizationId,
    payload: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? "",
      projectId: input.projectId,
      evaluationId: existing.id,
      signalId: input.signalId,
    },
  })

  return { jobId, evaluationId: existing.id } satisfies MonitorSignalResult
})
