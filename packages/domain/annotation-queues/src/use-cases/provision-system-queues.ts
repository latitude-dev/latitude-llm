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
    settings: { sampling: SYSTEM_QUEUE_DEFAULT_SAMPLING },
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
 * - Creates queues that don't exist yet (using insertIfNotExists for true idempotency)
 * - Skips queues that have been soft-deleted (respects user deletion)
 * - All system queues use the same slug generation from their canonical name
 * - Safe for concurrent calls: insertIfNotExists handles race conditions gracefully
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

          const existing = yield* queueRepository.findSystemQueueBySlugInProject({
            projectId,
            queueSlug: slug,
          })

          if (existing) {
            if (existing.deletedAt !== null) {
              results.push({ queueSlug: slug, action: "skipped" })
            } else {
              results.push({ queueSlug: slug, action: "exists" })
            }
            continue
          }

          const queue = createSystemQueue(projectId, organizationId, definition)
          const wasInserted = yield* queueRepository.insertIfNotExists(queue)
          results.push({ queueSlug: slug, action: wasInserted ? "created" : "exists" })
        }

        return results
      }),
    )
  })
