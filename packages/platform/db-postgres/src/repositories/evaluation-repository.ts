import type { Evaluation, EvaluationAlignment, EvaluationTrigger } from "@domain/evaluations"
import { EvaluationRepository, evaluationSchema } from "@domain/evaluations"
import { NotFoundError, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { evaluations } from "../schema/evaluations.ts"

const toDomainEvaluation = (row: typeof evaluations.$inferSelect): Evaluation =>
  evaluationSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    issueId: row.issueId,
    name: row.name,
    description: row.description,
    script: row.script,
    trigger: row.trigger as EvaluationTrigger,
    alignment: row.alignment as EvaluationAlignment,
    alignedAt: row.alignedAt,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

export const EvaluationRepositoryLive = Layer.effect(
  EvaluationRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findById: (id: string) =>
        sqlClient
          .query((db) =>
            db
              .select()
              .from(evaluations)
              .where(and(eq(evaluations.id, id), isNull(evaluations.deletedAt)))
              .limit(1),
          )
          .pipe(
            Effect.flatMap((results) => {
              const [result] = results
              if (!result) {
                return Effect.fail(new NotFoundError({ entity: "Evaluation", id }))
              }
              return Effect.succeed(toDomainEvaluation(result))
            }),
          ),
    }
  }),
)
