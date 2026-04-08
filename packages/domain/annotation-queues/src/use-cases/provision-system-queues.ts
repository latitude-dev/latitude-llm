import { generateId, type ProjectId, type RepositoryError, SqlClient, toSlug } from "@domain/shared"
import { Effect } from "effect"
import { SYSTEM_QUEUE_DEFAULT_SAMPLING, SYSTEM_QUEUE_DEFINITIONS, type SystemQueueDefinition } from "../constants.ts"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export interface ProvisionSystemQueuesInput {
  readonly organizationId: string
  readonly projectId: ProjectId
}

export type ProvisionSystemQueuesError = RepositoryError

const createSystemQueue = (
  projectId: ProjectId,
  organizationId: string,
  definition: SystemQueueDefinition,
): AnnotationQueue => {
  const now = new Date()
  const slug = toSlug(definition.name)

  return {
    id: generateId(),
    organizationId,
    projectId,
    system: true,
    name: definition.name,
    slug,
    description: definition.description,
    instructions: definition.instructions,
    // System queues have no filter (not live queues) but have sampling for flagger
    settings: {
      sampling: SYSTEM_QUEUE_DEFAULT_SAMPLING,
    },
    assignees: [],
    totalItems: 0,
    completedItems: 0,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Idempotently provisions default system annotation queues for a project.
 *
 * - Creates queues that don't exist yet
 * - Skips queues that have been soft-deleted (respects user deletion)
 * - All system queues use the same slug generation from their canonical name
 */
export const provisionSystemQueuesUseCase = (input: ProvisionSystemQueuesInput) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    const { organizationId, projectId } = input

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const queueRepository = yield* AnnotationQueueRepository

        const results: Array<{ queueSlug: string; action: "created" | "skipped" | "exists" }> = []

        for (const definition of SYSTEM_QUEUE_DEFINITIONS) {
          const slug = toSlug(definition.name)

          // Check if a system queue with this slug already exists (including soft-deleted)
          // We use findSystemQueueBySlugInProject which includes soft-deleted rows
          const existing = yield* queueRepository.findSystemQueueBySlugInProject({
            projectId,
            queueSlug: slug,
          })

          if (existing) {
            if (existing.deletedAt !== null) {
              // Soft-deleted: respect the deletion, don't recreate
              results.push({ queueSlug: slug, action: "skipped" })
            } else {
              // Active: already exists
              results.push({ queueSlug: slug, action: "exists" })
            }
            continue
          }

          // Create new system queue
          const queue = createSystemQueue(projectId, organizationId, definition)
          yield* queueRepository.save(queue)
          results.push({ queueSlug: slug, action: "created" })
        }

        return results
      }),
    )
  })
