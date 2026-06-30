import type { ScriptCompileError, ScriptRuntime } from "@domain/sandbox"
import {
  BadRequestError,
  type EvaluationSettings,
  generateId,
  type RepositoryError,
  type SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { compileSettingsToScript, validateAndHashEvaluationScript } from "../codegen/compile-settings-to-script.ts"
import { defaultEvaluationTrigger, evaluationSchema } from "../entities/evaluation.ts"
import { EvaluationRepository } from "../ports/evaluation-repository.ts"

export interface CreateEvaluationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly name: string
  readonly description: string
  /** Exactly one of `settings` or `script`. `settings` compiles to the script; `script` is raw (advanced). */
  readonly settings?: EvaluationSettings
  readonly script?: string
  readonly now?: Date
}

export interface CreateEvaluationResult {
  readonly evaluationId: string
  readonly script: string
}

export type CreateEvaluationError = BadRequestError | ScriptCompileError | RepositoryError

/**
 * Creates the evaluation that backs a signal. Compiles `settings` to a script (or accepts a raw
 * script), validates it compiles in the sandbox (ScriptCompileError → 422), stamps `script_hash`,
 * and persists it unaligned (alignment accrues later for judges). Does not provision a signal or a
 * monitor — the caller owns those.
 */
export const createEvaluationUseCase = (input: CreateEvaluationInput) =>
  Effect.gen(function* () {
    const hasSettings = input.settings !== undefined
    const hasScript = input.script !== undefined && input.script.length > 0
    if (hasSettings === hasScript) {
      return yield* new BadRequestError({ message: "Provide exactly one of `settings` or `script`" })
    }

    const settings = input.settings ?? null
    const script = settings ? compileSettingsToScript(settings) : (input.script as string)

    const scriptHash = yield* validateAndHashEvaluationScript(script)
    const now = input.now ?? new Date()
    const evaluation = evaluationSchema.parse({
      id: generateId<"EvaluationId">(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      signalId: input.signalId,
      name: input.name,
      description: input.description,
      settings,
      script,
      scriptHash,
      trigger: defaultEvaluationTrigger(),
      alignment: null,
      alignedAt: null,
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    })

    const repo = yield* EvaluationRepository
    yield* repo.save(evaluation)

    return { evaluationId: evaluation.id, script } satisfies CreateEvaluationResult
  }).pipe(Effect.withSpan("evaluations.createEvaluation")) as Effect.Effect<
    CreateEvaluationResult,
    CreateEvaluationError,
    EvaluationRepository | ScriptRuntime | SqlClient
  >
