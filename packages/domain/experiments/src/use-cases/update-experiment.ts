import {
  type ExperimentId,
  generateSlug,
  type NotFoundError,
  type RepositoryError,
  SqlClient,
  toSlug,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import { EXPERIMENT_NAME_MAX_LENGTH } from "../constants.ts"
import { type Experiment, experimentSchema } from "../entities/experiment.ts"
import { duplicateVariantName } from "../helpers.ts"
import { ExperimentRepository } from "../ports/experiment-repository.ts"
import { type CreateExperimentVariantInput, normalizeVariantInputs } from "./create-experiment.ts"

export interface UpdateExperimentInput {
  readonly id: ExperimentId
  readonly name?: string
  readonly description?: string
  /** Full replacement of the variants array (each carries its own `baseline` flag). */
  readonly variants?: readonly CreateExperimentVariantInput[]
}

export type UpdateExperimentError = NotFoundError | RepositoryError | ValidationError

export const updateExperimentUseCase = (
  input: UpdateExperimentInput,
): Effect.Effect<Experiment, UpdateExperimentError, SqlClient | ExperimentRepository> =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* ExperimentRepository
        const experiment = yield* repository.findById(input.id)

        let nextName = experiment.name
        let nextSlug = experiment.slug
        if (input.name !== undefined) {
          const trimmed = input.name.trim()
          if (trimmed.length < 1 || trimmed.length > EXPERIMENT_NAME_MAX_LENGTH) {
            return yield* new ValidationError({
              field: "name",
              message: `Name must be 1-${EXPERIMENT_NAME_MAX_LENGTH} characters`,
            })
          }
          if (trimmed !== experiment.name) {
            if (toSlug(trimmed) !== experiment.slug) {
              nextSlug = yield* generateSlug({
                name: trimmed,
                count: (slug) =>
                  repository.countActiveBySlug({ projectId: experiment.projectId, slug, excludeId: input.id }),
              }).pipe(
                Effect.catchTag("InvalidSlugInputError", (error) =>
                  Effect.fail(new ValidationError({ field: "name", message: error.reason })),
                ),
              )
            }
            nextName = trimmed
          }
        }

        const nextDescription = input.description !== undefined ? input.description.trim() : experiment.description
        const nextVariants = input.variants !== undefined ? normalizeVariantInputs(input.variants) : experiment.variants

        // Enforce name uniqueness only when the caller is writing variants, so a description-only
        // edit on a legacy experiment that still holds duplicate names isn't blocked by them.
        if (input.variants !== undefined) {
          const duplicate = duplicateVariantName(nextVariants)
          if (duplicate) {
            return yield* new ValidationError({ field: "variants", message: `Duplicate variant name "${duplicate}"` })
          }
        }

        const parsed = experimentSchema.safeParse({
          ...experiment,
          name: nextName,
          slug: nextSlug,
          description: nextDescription,
          variants: nextVariants,
          updatedAt: new Date(),
        })
        if (!parsed.success) {
          const issue = parsed.error.issues[0]
          return yield* new ValidationError({
            field: issue?.path.length ? issue.path.map(String).join(".") : "variants",
            message: issue?.message ?? "Invalid experiment",
          })
        }

        yield* repository.save(parsed.data)
        return parsed.data
      }),
    )
  })
