import { SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { UserRepository } from "@domain/users"
import { createFakeUserRepository } from "@domain/users/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { MARKETING_USER_GROUP_CODE_AGENTS, MARKETING_USER_GROUP_PROD_TRACES } from "../constants.ts"
import type {
  MarketingContactsPort,
  MarketingCreateContactInput,
  MarketingUpdateContactInput,
} from "../ports/marketing-contacts.ts"
import { updateContactOnboarding } from "./update-contact-onboarding.ts"

const USER_ID = UserId("ye9d77pxi50nh1gyqljkffnb")

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

describe("updateContactOnboarding", () => {
  it("maps coding-agent-machine to code-agents and includes job title", async () => {
    const { users, layers } = buildLayers()
    users.set(USER_ID, {
      id: USER_ID,
      email: "ada@example.com",
      name: "Ada Lovelace",
      jobTitle: "Founder",
      emailVerified: true,
      image: null,
      role: "user",
      createdAt: new Date("2025-06-01T12:00:00.000Z"),
    })

    const sender = createFakeSender()
    await Effect.runPromise(
      updateContactOnboarding({ marketingContacts: sender })({
        userId: USER_ID,
        stackChoice: "coding-agent-machine",
      }).pipe(Effect.provide(layers)),
    )

    expect(sender.updates).toEqual([
      {
        userId: USER_ID,
        email: "ada@example.com",
        firstName: "Ada Lovelace",
        jobTitle: "Founder",
        userGroup: MARKETING_USER_GROUP_CODE_AGENTS,
      },
    ])
  })

  it("maps production-agent to prod-traces", async () => {
    const { users, layers } = buildLayers()
    users.set(USER_ID, {
      id: USER_ID,
      email: "ada@example.com",
      name: "Ada Lovelace",
      jobTitle: "Founder",
      emailVerified: true,
      image: null,
      role: "user",
      createdAt: new Date("2025-06-01T12:00:00.000Z"),
    })

    const sender = createFakeSender()
    await Effect.runPromise(
      updateContactOnboarding({ marketingContacts: sender })({
        userId: USER_ID,
        stackChoice: "production-agent",
      }).pipe(Effect.provide(layers)),
    )

    expect(sender.updates[0]?.userGroup).toBe(MARKETING_USER_GROUP_PROD_TRACES)
  })

  it("is a no-op when the user no longer exists", async () => {
    const { layers } = buildLayers()
    const sender = createFakeSender()

    await Effect.runPromise(
      updateContactOnboarding({ marketingContacts: sender })({
        userId: USER_ID,
        stackChoice: "production-agent",
      }).pipe(Effect.provide(layers)),
    )

    expect(sender.updates).toHaveLength(0)
  })
})
