import { SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { UserRepository } from "@domain/users"
import { createFakeUserRepository } from "@domain/users/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { MARKETING_SOURCE_V2_SIGNUP } from "../constants.ts"
import type {
  MarketingContactsPort,
  MarketingCreateContactInput,
  MarketingUpdateContactInput,
} from "../ports/marketing-contacts.ts"
import { registerContact } from "./register-contact.ts"

const USER_ID = UserId("ye9d77pxi50nh1gyqljkffnb")
const CREATED_AT = new Date("2026-04-30T10:00:00.000Z")

interface FakeSender extends MarketingContactsPort {
  readonly creates: MarketingCreateContactInput[]
  readonly updates: MarketingUpdateContactInput[]
}

const createFakeSender = (): FakeSender => {
  const creates: MarketingCreateContactInput[] = []
  const updates: MarketingUpdateContactInput[] = []
  return {
    creates,
    updates,
    createContact: (input) =>
      Effect.sync(() => {
        creates.push(input)
      }),
    updateContact: (input) =>
      Effect.sync(() => {
        updates.push(input)
      }),
  }
}

const buildLayers = () => {
  const { repository: userRepo, users } = createFakeUserRepository()
  const sqlClient = createFakeSqlClient()
  const layers = Layer.mergeAll(Layer.succeed(UserRepository, userRepo), Layer.succeed(SqlClient, sqlClient))
  return { users, layers }
}

describe("registerContact", () => {
  it("creates a marketing contact with v2 signup metadata", async () => {
    const { users, layers } = buildLayers()
    const sender = createFakeSender()
    users.set(USER_ID, {
      id: USER_ID,
      email: "ada@example.com",
      name: "Ada Lovelace",
      jobTitle: null,
      emailVerified: true,
      image: null,
      role: "user",
      createdAt: CREATED_AT,
    })

    await Effect.runPromise(
      registerContact({ marketingContacts: sender })({ userId: USER_ID }).pipe(Effect.provide(layers)),
    )

    expect(sender.creates).toEqual([
      {
        email: "ada@example.com",
        userId: USER_ID,
        firstName: "Ada Lovelace",
        source: MARKETING_SOURCE_V2_SIGNUP,
        createdAt: CREATED_AT,
        subscribed: true,
      },
    ])
    expect(sender.updates).toHaveLength(0)
  })

  it("is a no-op when the user has been deleted before the task runs", async () => {
    const { layers } = buildLayers()
    const sender = createFakeSender()

    await Effect.runPromise(
      registerContact({ marketingContacts: sender })({ userId: UserId("missing-user-xxxxxxxxxxx") }).pipe(
        Effect.provide(layers),
      ),
    )

    expect(sender.creates).toHaveLength(0)
  })
})
