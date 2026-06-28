import { OutboxEventWriter } from "@domain/events"
import { createFakeOutboxEventWriter } from "@domain/events/testing"
import { OAuthKeyRepository } from "@domain/oauth-keys"
import { OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { User } from "../entities/user.ts"
import { UserRepository } from "../ports/user-repository.ts"
import { createFakeOAuthKeyRepository } from "../testing/fake-oauth-key-repository.ts"
import { createFakeUserRepository } from "../testing/fake-user-repository.ts"
import { createAccountUseCase } from "./create-account.ts"

const ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")

const UNUSED_EMAIL = "bob@email.com"

const EMAIL = "alice@example.com"
const WEB_URL = "https://example.com"
const USER_ID = UserId("ye9d77pxi50nh1gyqljkffnb")

const testUser: User = {
  id: USER_ID,
  email: "alice@example.com",
  name: "Alice",
  jobTitle: null,
  phoneNumber: null,
  emailVerified: true,
  image: null,
  role: "user",
  notificationPreferences: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
}

const createTestLayers = () => {
  const { repository: oauthKeyRepo, verificationValues } = createFakeOAuthKeyRepository()
  const { repository: userRepo, users } = createFakeUserRepository()
  const { outboxEventWriter, writtenEvents } = createFakeOutboxEventWriter()
  const fakeSqlClient = createFakeSqlClient()

  const testLayers = Layer.mergeAll(
    Layer.succeed(UserRepository, userRepo),
    Layer.succeed(OAuthKeyRepository, oauthKeyRepo),
    Layer.succeed(SqlClient, fakeSqlClient),
    Layer.succeed(OutboxEventWriter, outboxEventWriter),
  )

  return {
    testLayers,
    verificationValues,
    writtenEvents,
    users,
  }
}

const seed = (testLayers: ReturnType<typeof createTestLayers>) => {
  testLayers.users.set(USER_ID, testUser)
}

describe("createAccountUseCase", () => {
  it("creates a verification and outbox event when email does not exist", async () => {
    const layers = createTestLayers()
    seed(layers)

    const result = await Effect.runPromise(
      createAccountUseCase({
        organizationId: ORG_ID,
        email: UNUSED_EMAIL,
        webUrl: WEB_URL,
      }).pipe(Effect.provide(layers.testLayers)),
    )

    expect(result.success).toBe(true)
    expect(result.email).toBe(UNUSED_EMAIL)
    expect(result.token).toBeTruthy()

    expect(layers.verificationValues).toHaveLength(1)

    expect(layers.verificationValues[0]).toMatchObject({
      hashedToken: result.token,
      value: JSON.stringify({ email: UNUSED_EMAIL }),
    })

    expect(layers.writtenEvents).toHaveLength(1)

    expect(layers.writtenEvents[0]).toMatchObject({
      eventName: "MagicLinkEmailRequested",
      payload: {
        email: UNUSED_EMAIL,
      },
    })
  })
  it("does not create a verification or outbox event when the email already exists", async () => {
    const layers = createTestLayers()
    seed(layers)

    const result = await Effect.runPromise(
      createAccountUseCase({
        organizationId: ORG_ID,
        email: EMAIL,
        webUrl: WEB_URL,
      }).pipe(Effect.provide(layers.testLayers)),
    )

    expect(result.success).toBe(false)

    expect(layers.verificationValues).toHaveLength(0)
    expect(layers.writtenEvents).toHaveLength(0)
  })
})
