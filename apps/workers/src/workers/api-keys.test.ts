import { ApiKeyRepository } from "@domain/api-keys"
import type { QueueConsumer, QueueName, TaskHandlers } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { ApiKeyRepositoryLive, withPostgres } from "@platform/db-postgres"
import { setupTestPostgres } from "@platform/db-postgres/testing"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { createApiKeysWorker } from "./api-keys.ts"

type AnyTaskHandlers = Record<string, (payload: unknown) => Effect.Effect<void, unknown>>

class TestQueueConsumer implements QueueConsumer {
  private readonly registered = new Map<QueueName, AnyTaskHandlers>()

  subscribe<T extends QueueName>(queue: T, handlers: TaskHandlers<T>): void {
    this.registered.set(queue, handlers as unknown as AnyTaskHandlers)
  }

  start() {
    return Effect.void
  }

  stop() {
    return Effect.void
  }

  async dispatchTask(queue: QueueName, task: string, payload: unknown): Promise<void> {
    const handlers = this.registered.get(queue)
    if (!handlers) throw new Error(`No handlers registered for queue ${queue}`)
    const handler = handlers[task]
    if (!handler) throw new Error(`No handler for task ${task} on queue ${queue}`)
    await Effect.runPromise(handler(payload))
  }
}

/** Same 32-byte hex test key as API route integration tests */
const TEST_ENCRYPTION_KEY_HEX = "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"

const pg = setupTestPostgres()
const ORG_ID = OrganizationId("org_api_keys_worker_test")

describe("createApiKeysWorker", () => {
  beforeAll(() => {
    process.env.LAT_MASTER_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY_HEX
  })

  it("persists an API key for the organization", async () => {
    const consumer = new TestQueueConsumer()
    createApiKeysWorker(consumer, { postgresClient: pg.appPostgresClient })

    await consumer.dispatchTask("api-keys", "create", {
      organizationId: ORG_ID,
      name: "Default API Key",
    })

    const keys = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo.findAll()
      }).pipe(withPostgres(ApiKeyRepositoryLive, pg.appPostgresClient, ORG_ID)),
    )

    expect(keys).toHaveLength(1)
    expect(keys[0]?.name).toBe("Default API Key")
    expect(keys[0]?.tokenHash.length).toBeGreaterThan(0)
  })
})
