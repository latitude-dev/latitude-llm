import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SYSTEM_QUEUE_DEFINITIONS } from "../constants.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { createFakeAnnotationQueueRepository } from "../testing/fake-annotation-queue-repository.ts"
import { provisionSystemQueuesUseCase } from "./provision-system-queues.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const ORG_ID = OrganizationId("o".repeat(24))

const createTestLayer = () => {
  const { repository, queues } = createFakeAnnotationQueueRepository()

  return {
    queues,
    layer: Layer.mergeAll(
      Layer.succeed(AnnotationQueueRepository, repository),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    ),
  }
}

describe("provisionSystemQueuesUseCase", () => {
  it("provisions each system queue with the sampling rate from its definition", async () => {
    const { layer, queues } = createTestLayer()

    await Effect.runPromise(
      provisionSystemQueuesUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
      }).pipe(Effect.provide(layer)),
    )

    const createdQueues = [...queues.values()]
    expect(createdQueues).toHaveLength(SYSTEM_QUEUE_DEFINITIONS.length)

    for (const definition of SYSTEM_QUEUE_DEFINITIONS) {
      const queue = createdQueues.find((createdQueue) => createdQueue.slug === definition.slug)

      expect(queue?.settings.sampling).toBe(definition.sampling)
    }
  })
})
