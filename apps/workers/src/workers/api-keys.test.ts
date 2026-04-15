import { ApiKeyRepository } from "@domain/api-keys"
import { OrganizationId } from "@domain/shared"
import { ApiKeyRepositoryLive, withPostgres } from "@platform/db-postgres"
import { setupTestPostgres } from "@platform/db-postgres/testing"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createApiKeysWorker } from "./api-keys.ts"

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
    createApiKeysWorker({ consumer, postgresClient: pg.appPostgresClient })

    await consumer.dispatchTask("api-keys", "create", {
      organizationId: ORG_ID,
      name: "Default API Key",
    })

    const keys = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo.list()
      }).pipe(withPostgres(ApiKeyRepositoryLive, pg.appPostgresClient, ORG_ID)),
    )

    expect(keys).toHaveLength(1)
    expect(keys[0]?.name).toBe("Default API Key")
    expect(keys[0]?.tokenHash.length).toBeGreaterThan(0)
  })
})
