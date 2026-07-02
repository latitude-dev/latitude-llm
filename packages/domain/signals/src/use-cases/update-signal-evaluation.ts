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

// Exactly one of a declarative `settings` form or a raw `script`, mirroring createSignal.
const evaluationDraftSchema = z.union([
  z.object({ settings: evaluationSettingsSchema }),
  z.object({ script: z.string().min(1) }),
])

const updateSignalEvaluationInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  signalId: signalIdSchema,
  evaluation: evaluationDraftSchema,
  sampling: z.number().int().min(0).max(100).optional(),
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
 * Recompiles a user signal's active evaluation from a new `settings` form or replaces its raw
 * `script`, **in place** (same evaluation id). Updating in place — rather than archiving and minting
 * a new row — matches the shipped realign path (`persistAlignmentResult`) and avoids a lineage/naming
 * scheme for the replacement row. Only `origin = 'user'` signals are editable here (system signals are
 * rejected); the evaluation can be freely re-authored across kinds — settings ⇄ raw script — with
 * `settings` set to the new form or nulled when a raw script is supplied. Edits apply forward-only;
 * existing scores keep their frozen membership. The signal's `filters` (the live pre-gate) are
 * untouched and continue to gate the same evaluation.
 */
export const updateSignalEvaluationUseCase = (input: UpdateSignalEvaluationInput) =>
  Effect.gen(function* () {
    const parsed = updateSignalEvaluationInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("signalId", parsed.signalId)
    const sqlClient = yield* SqlClient
    const now = parsed.now ?? new Date()

    const settings = "settings" in parsed.evaluation ? parsed.evaluation.settings : null
    const script =
      "settings" in parsed.evaluation ? compileSettingsToScript(parsed.evaluation.settings) : parsed.evaluation.script
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

        const scriptChanged = evaluation.script !== script
        const samplingChanged = parsed.sampling !== undefined && evaluation.trigger.sampling !== parsed.sampling
        if (!scriptChanged && !samplingChanged) {
          return {
            signalId: signal.id,
            evaluationId: evaluation.id,
            changed: false,
          } satisfies UpdateSignalEvaluationResult
        }

        yield* evaluationRepository.save({
          ...evaluation,
          settings,
          script,
          scriptHash,
          // Only a definition change invalidates alignment; a sampling-only change keeps it.
          ...(scriptChanged ? { alignment: null, alignedAt: null } : {}),
          trigger:
            parsed.sampling !== undefined ? { ...evaluation.trigger, sampling: parsed.sampling } : evaluation.trigger,
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
