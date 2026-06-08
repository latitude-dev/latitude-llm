import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { SANDBOX_API_KEY_TOKEN_PREFIX } from "../constants.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"
import { createFakeApiKeyRepository } from "../testing/index.ts"
import { generateApiKeyUseCase } from "./generate-api-key.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")

const mint = (isSandbox: boolean) => {
  const sqlClient: SqlClientShape = {
    organizationId: ORG_ID,
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: () => Effect.die(new Error("unexpected query")),
  }

  const { repository } = createFakeApiKeyRepository()

  return Effect.runPromise(
    generateApiKeyUseCase({ name: "My key", isSandbox }).pipe(
      Effect.provideService(SqlClient, sqlClient),
      Effect.provideService(ApiKeyRepository, repository),
      Effect.provideService(OutboxEventWriter, {
        write: (_event: OutboxWriteEvent) => Effect.void,
      }),
    ),
  )
}

describe("generateApiKeyUseCase", () => {
  it("prefixes the token with lat_sandbox_ when isSandbox is true", async () => {
    const apiKey = await mint(true)
    expect(apiKey.token.startsWith(SANDBOX_API_KEY_TOKEN_PREFIX)).toBe(true)
  })

  it("leaves the token unprefixed when isSandbox is false", async () => {
    const apiKey = await mint(false)
    expect(apiKey.token.startsWith(SANDBOX_API_KEY_TOKEN_PREFIX)).toBe(false)
  })
})
