import {
  generateSlug,
  type MonitorId,
  type NotFoundError,
  type RepositoryError,
  SqlClient,
  toSlug,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import { SystemMonitorForbiddenError } from "../errors.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

const NAME_MAX_LENGTH = 128

export interface UpdateMonitorInput {
  readonly id: MonitorId
  readonly name?: string
  readonly description?: string
}

export type UpdateMonitorError = NotFoundError | RepositoryError | SystemMonitorForbiddenError | ValidationError

/**
 * Edits a user monitor's metadata (name + description) only — its alerts are
 * managed through the monitor-alert use-cases. Rejects system monitors (locked).
 * Regenerates the slug only when the name's normalised form changes, so a
 * cosmetic capitalisation edit keeps the URL stable.
 */
export const updateMonitorUseCase = (
  input: UpdateMonitorInput,
): Effect.Effect<Monitor, UpdateMonitorError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* MonitorRepository
        const monitor = yield* repository.findById(input.id)
        if (monitor.system) {
          return yield* new SystemMonitorForbiddenError({ monitorId: input.id, operation: "edited" })
        }

        let nextName = monitor.name
        let nextSlug = monitor.slug
        if (input.name !== undefined) {
          const trimmed = input.name.trim()
          if (trimmed.length < 1 || trimmed.length > NAME_MAX_LENGTH) {
            return yield* new ValidationError({
              field: "name",
              message: `Name must be 1–${NAME_MAX_LENGTH} characters`,
            })
          }
          if (trimmed !== monitor.name) {
            if (toSlug(trimmed) !== monitor.slug) {
              nextSlug = yield* generateSlug({
                name: trimmed,
                count: (slug) =>
                  repository.countActiveBySlug({ projectId: monitor.projectId, slug, excludeId: input.id }),
              }).pipe(
                Effect.catchTag("InvalidSlugInputError", (error) =>
                  Effect.fail(new ValidationError({ field: "name", message: error.reason })),
                ),
              )
            }
            nextName = trimmed
          }
        }

        const nextDescription = input.description !== undefined ? input.description.trim() : monitor.description

        const now = new Date()
        yield* repository.updateMetadata({
          id: input.id,
          name: nextName,
          slug: nextSlug,
          description: nextDescription,
        })
        return { ...monitor, name: nextName, slug: nextSlug, description: nextDescription, updatedAt: now }
      }),
    )
  })
