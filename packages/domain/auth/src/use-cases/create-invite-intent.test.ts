import { NotFoundError } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { AuthIntentRepository, type PendingInvite } from "../ports/auth-intent-repository.ts"
import type { AuthIntent } from "../types.ts"
import { createInviteIntentUseCase, InviteAlreadyPendingError } from "./create-invite-intent.ts"

interface FakeAuthIntentRepo {
  readonly savedIntents: AuthIntent[]
  readonly pendingInvitesByOrganizationId: Map<string, readonly PendingInvite[]>
}

const createFakeAuthIntentRepository = (fake: FakeAuthIntentRepo) => ({
  save: (intent: AuthIntent) =>
    Effect.sync(() => {
      fake.savedIntents.push(intent)
    }),
  findById: (id: string) => Effect.fail(new NotFoundError({ entity: "AuthIntent", id })),
  markConsumed: () => Effect.succeed(undefined),
  findPendingInvitesByOrganizationId: (organizationId: string) =>
    Effect.succeed(fake.pendingInvitesByOrganizationId.get(organizationId) ?? []),
})

const createFakeUserRepository = () => ({
  findByEmail: (email: string) => Effect.fail(new NotFoundError({ entity: "User", id: email })),
  setNameIfMissing: (_params: { userId: string; name: string }) => Effect.succeed(undefined),
})

const createTestLayers = (fakeAuthIntentRepo: FakeAuthIntentRepo) =>
  Layer.mergeAll(
    Layer.succeed(AuthIntentRepository, createFakeAuthIntentRepository(fakeAuthIntentRepo)),
    Layer.succeed(UserRepository, createFakeUserRepository()),
  )

describe("createInviteIntentUseCase", () => {
  it("creates an invite intent when no pending invite exists for the email in the organization", async () => {
    const fakeAuthIntentRepo: FakeAuthIntentRepo = {
      savedIntents: [],
      pendingInvitesByOrganizationId: new Map(),
    }
    const testLayers = createTestLayers(fakeAuthIntentRepo)

    const intent = await Effect.runPromise(
      createInviteIntentUseCase({
        email: " Invited@Example.com ",
        organizationId: "org_1",
        organizationName: "Acme",
        inviterName: "Alice",
      }).pipe(Effect.provide(testLayers)),
    )

    expect(intent.email).toBe("invited@example.com")
    expect(intent.type).toBe("invite")
    expect(fakeAuthIntentRepo.savedIntents).toHaveLength(1)
    expect(fakeAuthIntentRepo.savedIntents[0]?.email).toBe("invited@example.com")
  })

  it("rejects duplicate pending invite for same email and organization", async () => {
    const fakeAuthIntentRepo: FakeAuthIntentRepo = {
      savedIntents: [],
      pendingInvitesByOrganizationId: new Map([
        [
          "org_1",
          [
            {
              id: "intent_existing",
              email: "INVITED@EXAMPLE.COM",
              createdAt: new Date(),
            },
          ],
        ],
      ]),
    }
    const testLayers = createTestLayers(fakeAuthIntentRepo)

    const error = await Effect.runPromise(
      createInviteIntentUseCase({
        email: " invited@example.com ",
        organizationId: "org_1",
        organizationName: "Acme",
        inviterName: "Alice",
      }).pipe(Effect.provide(testLayers), Effect.flip),
    )

    expect(error).toBeInstanceOf(InviteAlreadyPendingError)
    expect(fakeAuthIntentRepo.savedIntents).toHaveLength(0)
  })

  it("allows invite when pending invite exists for same email in another organization", async () => {
    const fakeAuthIntentRepo: FakeAuthIntentRepo = {
      savedIntents: [],
      pendingInvitesByOrganizationId: new Map([
        [
          "org_2",
          [
            {
              id: "intent_existing",
              email: "invited@example.com",
              createdAt: new Date(),
            },
          ],
        ],
      ]),
    }
    const testLayers = createTestLayers(fakeAuthIntentRepo)

    const intent = await Effect.runPromise(
      createInviteIntentUseCase({
        email: "invited@example.com",
        organizationId: "org_1",
        organizationName: "Acme",
        inviterName: "Alice",
      }).pipe(Effect.provide(testLayers)),
    )

    expect(intent.email).toBe("invited@example.com")
    expect(fakeAuthIntentRepo.savedIntents).toHaveLength(1)
  })
})
