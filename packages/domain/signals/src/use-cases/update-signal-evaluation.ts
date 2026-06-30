import {
  compileSettingsToScript,
  EvaluationRepository,
  isActiveEvaluation,
  validateAndHashEvaluationScript,
} from "@domain/evaluations"
import type { ScriptCompileError, ScriptRuntime } from "@domain/sandbox"
import {
  BadRequestError,
  type ConcurrentSqlTransactionError,
  cuidSchema,
  evaluationSettingsSchema,
  type NotFoundError,
  ProjectId,
  type RepositoryError,
  SqlClient,
  signalIdSchema,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { SignalRepository } from "../ports/signal-repository.ts"

const updateSignalEvaluationInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  signalId: signalIdSchema,
  settings: evaluationSettingsSchema,
  now: z.date().optional(),
})

export type UpdateSignalEvaluationInput = z.input<typeof updateSignalEvaluationInputSchema>

export interface UpdateSignalEvaluationResult {
  readonly signalId: string
  readonly evaluationId: string
  readonly changed: boolean
}

export type UpdateSignalEvaluationError =
  | BadRequestError
  | NotFoundError
  | ScriptCompileError
  | ConcurrentSqlTransactionError
  | RepositoryError

/**
 * Recompiles a user signal's active evaluation from a new `settings` form, **in place** (same
 * evaluation id). Updating in place — rather than archiving and minting a new row — is required by
 * the `(org, project, name)` unique index (two non-deleted same-named rows collide) and matches the
 * shipped realign path (`persistAlignmentResult`). Only `origin = 'user'` signals whose active
 * evaluation is settings-defined are editable here: raw-script and system signals are rejected.
 * Edits apply forward-only; existing scores keep their frozen membership. The signal's `filters`
 * (the live pre-gate) are untouched and continue to gate the same evaluation.
 */
export const updateSignalEvaluationUseCase = (input: UpdateSignalEvaluationInput) =>
  Effect.gen(function* () {
    const parsed = updateSignalEvaluationInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("signalId", parsed.signalId)
    const sqlClient = yield* SqlClient
    const now = parsed.now ?? new Date()

    const script = compileSettingsToScript(parsed.settings)
    const scriptHash = yield* validateAndHashEvaluationScript(script)

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const signal = yield* signalRepository.findByIdForUpdate(parsed.signalId)
        if (signal.projectId !== parsed.projectId) {
          return yield* new BadRequestError({
            message: `Signal ${signal.id} does not belong to project ${parsed.projectId}`,
          })
        }
        if (signal.origin !== "user") {
          return yield* new BadRequestError({
            message: "Only user-created signals can have their evaluation settings edited",
          })
        }

        const evaluationRepository = yield* EvaluationRepository
        const active = yield* evaluationRepository
          .listBySignalId({ projectId: parsed.projectId, signalId: parsed.signalId, options: { lifecycle: "active" } })
          .pipe(Effect.map((page) => page.items.filter(isActiveEvaluation)))
        const evaluation = active[0]
        if (evaluation === undefined) {
          return yield* new BadRequestError({
            message: `Signal ${signal.id} has no active evaluation to edit`,
          })
        }
        if (evaluation.settings == null) {
          return yield* new BadRequestError({
            message: "This signal's evaluation was defined from a raw script and is not settings-editable",
          })
        }

        if (evaluation.script === script) {
          return {
            signalId: signal.id,
            evaluationId: evaluation.id,
            changed: false,
          } satisfies UpdateSignalEvaluationResult
        }

        yield* evaluationRepository.save({
          ...evaluation,
          settings: parsed.settings,
          script,
          scriptHash,
          alignment: null,
          alignedAt: null,
          updatedAt: now,
        })

        return {
          signalId: signal.id,
          evaluationId: evaluation.id,
          changed: true,
        } satisfies UpdateSignalEvaluationResult
      }),
    )
  }).pipe(Effect.withSpan("signals.updateSignalEvaluation")) as Effect.Effect<
    UpdateSignalEvaluationResult,
    UpdateSignalEvaluationError,
    SignalRepository | EvaluationRepository | ScriptRuntime | SqlClient
  >
