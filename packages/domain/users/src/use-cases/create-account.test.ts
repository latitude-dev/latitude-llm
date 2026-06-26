import { OAuthKeyRepository } from "@domain/oauth-keys"
import { OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { OutboxEventWriter } from "../../../events/src/outbox-event-writer.ts"
import { createFakeOAuthKeyRepository } from "../testing/fake-oauth-key-repository.ts"
import { createFakeOutboxEventWriter } from "../testing/fake-outbox-event-writer.ts"
import { createAccountUseCase } from "./create-account.ts"

const ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")

const EMAIL = "alice@example.com"
const WEB_URL = "https://example.com"

const createTestLayers = () => {
  const { repository: oauthKeyRepo, verificationValues } = createFakeOAuthKeyRepository()
  const { outboxEventWriter, writtenEvents } = createFakeOutboxEventWriter()
  const fakeSqlClient = createFakeSqlClient()

  const testLayers = Layer.mergeAll(
    Layer.succeed(OAuthKeyRepository, oauthKeyRepo),
    Layer.succeed(SqlClient, fakeSqlClient),
    Layer.succeed(OutboxEventWriter, outboxEventWriter),
  )

  return {
    testLayers,
    verificationValues,
    writtenEvents,
  }
}

describe("createAccountUseCase", () => {
  it("creates a verification and outbox event", async () => {
    const layers = createTestLayers()

    const result = await Effect.runPromise(
      createAccountUseCase({
        organizationId: ORG_ID,
        email: EMAIL,
        webUrl: WEB_URL,
      }).pipe(Effect.provide(layers.testLayers)),
    )

    expect(result.email).toBe(EMAIL)
    expect(result.token).toBeTruthy()

    expect(layers.verificationValues).toHaveLength(1)

    expect(layers.verificationValues[0]).toMatchObject({
      hashedToken: result.token,
      value: JSON.stringify({ email: EMAIL }),
    })

    expect(layers.writtenEvents).toHaveLength(1)

    expect(layers.writtenEvents[0]).toMatchObject({
      eventName: "MagicLinkEmailRequested",
      payload: {
        email: EMAIL,
      },
    })
  })
})
