import {
  ExperimentId,
  type FilterSet,
  generateId,
  generateSlug,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import { EXPERIMENT_NAME_MAX_LENGTH } from "../constants.ts"
import {
  type Experiment,
  type ExperimentVariant,
  experimentSchema,
  type VariantTimeRange,
} from "../entities/experiment.ts"
import { duplicateVariantName, ensureBaseline, firstAvailableVariantName } from "../helpers.ts"
import { ExperimentRepository } from "../ports/experiment-repository.ts"

export interface CreateExperimentVariantInput {
  readonly id?: string | undefined
  readonly name?: string | undefined
  readonly baseline?: boolean | undefined
  readonly filterSet?: FilterSet | undefined
  readonly query?: string | null | undefined
  readonly timeRange?: VariantTimeRange | undefined
}

export interface CreateExperimentInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly name: string
  readonly description?: string
  readonly variants?: readonly CreateExperimentVariantInput[]
}

export type CreateExperimentError = RepositoryError | ValidationError

/** A new experiment seeds a baseline plus one comparison variant (`"Variant A"` + `"Variant B"`) so the detail view is useful immediately. An explicit (even empty) `variants` array overrides this. */
const DEFAULT_NEW_VARIANTS: readonly CreateExperimentVariantInput[] = [{ baseline: true }, {}]

/**
 * Fill each input variant into a full `ExperimentVariant`: mint missing ids, guarantee a single
 * baseline, then default any unnamed variant to a positional `"Variant A/B/…"` name. The baseline is
 * not named specially — it carries a "BASELINE" badge in the UI, so a distinct name would be redundant.
 */
export const normalizeVariantInputs = (
  inputs: readonly CreateExperimentVariantInput[],
): readonly ExperimentVariant[] => {
  const resolved = ensureBaseline(
    inputs.map((input) => ({
      id: input.id ?? generateId(),
      name: input.name?.trim() ?? "",
      baseline: input.baseline ?? false,
      filterSet: input.filterSet ?? {},
      query: input.query ?? null,
      timeRange: input.timeRange ?? null,
    })),
  )
  const used = new Set(resolved.filter((variant) => variant.name.length > 0).map((variant) => variant.name))
  return resolved.map((variant) => {
    if (variant.name.length > 0) return variant
    const name = firstAvailableVariantName(used)
    used.add(name)
    return { ...variant, name }
  })
}

const validationErrorFromParse = (error: { issues: readonly { path: PropertyKey[]; message: string }[] }) => {
  const issue = error.issues[0]
  return new ValidationError({
    field: issue?.path.length ? issue.path.map(String).join(".") : "variants",
    message: issue?.message ?? "Invalid experiment",
  })
}

export const createExperimentUseCase = (
  input: CreateExperimentInput,
): Effect.Effect<Experiment, CreateExperimentError, SqlClient | ExperimentRepository> =>
  Effect.gen(function* () {
    const trimmedName = input.name.trim()
    if (trimmedName.length < 1 || trimmedName.length > EXPERIMENT_NAME_MAX_LENGTH) {
      return yield* new ValidationError({
        field: "name",
        message: `Name must be 1-${EXPERIMENT_NAME_MAX_LENGTH} characters`,
      })
    }

    const variants = normalizeVariantInputs(input.variants ?? DEFAULT_NEW_VARIANTS)
    const duplicate = duplicateVariantName(variants)
    if (duplicate) {
      return yield* new ValidationError({ field: "variants", message: `Duplicate variant name "${duplicate}"` })
    }

    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* ExperimentRepository
        const now = new Date()
        const experimentId = ExperimentId(generateId())
        const slug = yield* generateSlug({
          name: trimmedName,
          count: (candidate) =>
            repository.countActiveBySlug({ projectId: input.projectId, slug: candidate, excludeId: experimentId }),
        }).pipe(
          Effect.catchTag("InvalidSlugInputError", (error) =>
            Effect.fail(new ValidationError({ field: "name", message: error.reason })),
          ),
        )

        const parsed = experimentSchema.safeParse({
          id: experimentId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          slug,
          name: trimmedName,
          description: input.description?.trim() ?? "",
          variants,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        if (!parsed.success) return yield* Effect.fail(validationErrorFromParse(parsed.error))

        yield* repository.create(parsed.data)
        return parsed.data
      }),
    )
  })
