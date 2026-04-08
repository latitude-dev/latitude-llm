import type { NotFoundError, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Evaluation } from "../entities/evaluation.ts"

interface EvaluationRepositoryShape {
  findById(id: string): Effect.Effect<Evaluation, NotFoundError | RepositoryError>
}

export class EvaluationRepository extends ServiceMap.Service<EvaluationRepository, EvaluationRepositoryShape>()(
  "@domain/evaluations/EvaluationRepository",
) {}
