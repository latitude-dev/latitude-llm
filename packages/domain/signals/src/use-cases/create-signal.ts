import { createEvaluationUseCase, type EvaluationRepository } from "@domain/evaluations"
import { OutboxEventWriter } from "@domain/events"
import { ProjectRepository } from "@domain/projects"
import type { ScriptCompileError, ScriptRuntime } from "@domain/sandbox"
import {
  type BadRequestError,
  type ConcurrentSqlTransactionError,
  cuidSchema,
  evaluationDraftSchema,
  filterSetSchema,
  generateId,
  type NotFoundError,
  ProjectId,
  type RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { SIGNAL_NAME_MAX_LENGTH } from "../constants.ts"
import { signalPrioritySchema, signalSchema } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { generateSignalSlug, type SignalSlugGenerationError } from "../slug.ts"

const createSignalInputSchema = z.object({
  organizationId: cuidSchema,
  projectId: cuidSchema.transform(ProjectId),
  name: z.string().min(1).max(SIGNAL_NAME_MAX_LENGTH),
  description: z.string().min(1),
  priority: signalPrioritySchema.nullish(),
  filters: filterSetSchema.nullish(),
  // A user signal MUST have an evaluation: exactly one of a declarative `settings` form or a raw `script`.
  evaluation: evaluationDraftSchema,
  sampling: z.number().int().min(0).max(100).optional(),
  now: z.date().optional(),
})

export type CreateSignalInput = z.input<typeof createSignalInputSchema>

export interface CreateSignalResult {
  readonly signalId: string
  readonly slug: string
  readonly evaluationId: string
}

export type CreateSignalError =
  | BadRequestError
  | ScriptCompileError
  | ConcurrentSqlTransactionError
  | RepositoryError
  | NotFoundError
  | SignalSlugGenerationError

export const createSignalUseCase = (input: CreateSignalInput) =>
  Effect.gen(function* () {
    const parsed = createSignalInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", String(parsed.projectId))
    const sqlClient = yield* SqlClient
    const now = parsed.now ?? new Date()

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const outboxEventWriter = yield* OutboxEventWriter
        const projectRepository = yield* ProjectRepository

        const project = yield* projectRepository.findById(parsed.projectId)
        const slug = yield* generateSignalSlug({
          projectSlug: project.slug,
          count: (slug) => signalRepository.countBySlug({ slug }),
        })

        const signal = signalSchema.parse({
          id: generateId<"SignalId">(),
          organizationId: parsed.organizationId,
          projectId: parsed.projectId,
          slug,
          name: parsed.name,
          description: parsed.description,
          // user signals carry no score-provenance; `origin` is the authoritative user|system marker
          source: "custom",
          origin: "user",
          filters: parsed.filters ?? null,
          assigneeId: null,
          priority: parsed.priority ?? null,
          centroid: null,
          clusteredAt: null,
          resolvedAt: null,
          ignoredAt: null,
          regressedAt: null,
          mutedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        yield* signalRepository.save(signal)

        const evaluation = yield* createEvaluationUseCase({
          organizationId: parsed.organizationId,
          projectId: parsed.projectId,
          signalId: signal.id,
          name: parsed.name,
          description: parsed.description,
          ...("settings" in parsed.evaluation
            ? { settings: parsed.evaluation.settings }
            : { script: parsed.evaluation.script }),
          ...(parsed.sampling !== undefined ? { sampling: parsed.sampling } : {}),
          now,
        })

        yield* outboxEventWriter.write({
          eventName: "SignalCreated",
          aggregateType: "issue",
          aggregateId: signal.id,
          organizationId: signal.organizationId,
          payload: {
            organizationId: signal.organizationId,
            projectId: signal.projectId,
            signalId: signal.id,
            createdAt: signal.createdAt.toISOString(),
          },
        })

        return { signalId: signal.id, slug, evaluationId: evaluation.evaluationId } satisfies CreateSignalResult
      }),
    )
  }).pipe(Effect.withSpan("signals.createSignal")) as Effect.Effect<
    CreateSignalResult,
    CreateSignalError,
    SignalRepository | EvaluationRepository | OutboxEventWriter | ProjectRepository | ScriptRuntime | SqlClient
  >
