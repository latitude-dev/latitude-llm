import type { EvaluationRepository } from "@domain/evaluations"
import { OutboxEventWriter } from "@domain/events"
import { scoreValueSchema } from "@domain/scores"
import {
  BadRequestError,
  type ConcurrentSqlTransactionError,
  cuidSchema,
  type NotFoundError,
  ProjectId,
  RepositoryError,
  type SettingsReader,
  SqlClient,
  signalIdSchema,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import type { SignalFeedback } from "../entities/signal.ts"
import {
  SignalFeedbackAlreadySubmittedError,
  SignalFeedbackNotSupportedError,
  SignalFeedbackReasonRequiredError,
} from "../errors.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { applySignalLifecycleCommandUseCase } from "./apply-signal-lifecycle-command.ts"

const submitSignalFeedbackInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  signalId: signalIdSchema,
  passed: z.boolean(),
  /** Defaults to the polarity of `passed`; an explicit value is honoured. */
  value: scoreValueSchema.optional(),
  feedback: z.string().optional(),
  /** Archives the signal in the same gesture — the fast path out of a false positive. */
  ignore: z.boolean().optional(),
  now: z.date().optional(),
})

export type SubmitSignalFeedbackInput = z.input<typeof submitSignalFeedbackInputSchema>

export interface SubmitSignalFeedbackResult {
  readonly signalId: string
  readonly feedback: SignalFeedback
  readonly ignored: boolean
}

export type SubmitSignalFeedbackError =
  | BadRequestError
  | ConcurrentSqlTransactionError
  | NotFoundError
  | RepositoryError
  | SignalFeedbackAlreadySubmittedError
  | SignalFeedbackNotSupportedError
  | SignalFeedbackReasonRequiredError

export const submitSignalFeedbackUseCase = (
  input: SubmitSignalFeedbackInput,
): Effect.Effect<
  SubmitSignalFeedbackResult,
  SubmitSignalFeedbackError,
  EvaluationRepository | OutboxEventWriter | SettingsReader | SignalRepository | SqlClient
> =>
  Effect.gen(function* () {
    const parsed = submitSignalFeedbackInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", String(parsed.projectId))
    yield* Effect.annotateCurrentSpan("signalId", parsed.signalId)
    const sqlClient = yield* SqlClient
    const signalRepository = yield* SignalRepository
    const now = parsed.now ?? new Date()

    const signal = yield* signalRepository.findById(parsed.signalId)
    if (signal.projectId !== parsed.projectId) {
      return yield* new BadRequestError({
        message: `Signal ${signal.id} does not belong to project ${parsed.projectId}`,
      })
    }

    // Only a flagger's own detections can be graded: the verdict exists to measure
    // how well Latitude flags, and there is no generation of ours behind a signal
    // somebody wrote by hand or one born from a human annotation.
    if (signal.source !== "flagger") {
      return yield* new SignalFeedbackNotSupportedError({ signalId: signal.id })
    }

    const reason = parsed.feedback?.trim() ?? ""
    if (!parsed.passed && reason.length === 0) {
      return yield* new SignalFeedbackReasonRequiredError({ signalId: signal.id })
    }

    const feedback: SignalFeedback = {
      value: parsed.value ?? (parsed.passed ? 1 : 0),
      passed: parsed.passed,
      feedback: reason,
    }

    yield* sqlClient.transaction(
      Effect.gen(function* () {
        const claimed = yield* signalRepository.claimFeedback({ signalId: signal.id, feedback, now })
        if (!claimed) {
          return yield* new SignalFeedbackAlreadySubmittedError({ signalId: signal.id })
        }

        const outboxEventWriter = yield* OutboxEventWriter
        yield* outboxEventWriter
          .write({
            eventName: "SignalFeedbackSubmitted",
            aggregateType: "issue",
            aggregateId: signal.id,
            organizationId: signal.organizationId,
            payload: {
              organizationId: signal.organizationId,
              projectId: signal.projectId,
              signalId: signal.id,
              value: feedback.value,
              passed: feedback.passed,
              feedback: feedback.feedback,
            },
          })
          .pipe(Effect.mapError((cause) => new RepositoryError({ operation: "OutboxEventWriter.write", cause })))
      }),
    )

    // The verdict is the durable artifact, so it is claimed before the archive
    // runs: a lifecycle failure surfaces as an error with the verdict standing,
    // and ignoring is one more click from the header.
    if (parsed.ignore === true) {
      yield* applySignalLifecycleCommandUseCase({
        projectId: parsed.projectId,
        signalIds: [signal.id],
        command: "ignore",
        now,
      })
    }

    return { signalId: signal.id, feedback, ignored: parsed.ignore === true }
  }).pipe(Effect.withSpan("issues.submitSignalFeedback"))
