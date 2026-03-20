import { UserRepository } from "@domain/users"
import { createFakeUserRepository } from "@domain/users/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { AuthIntentRepository, type PendingInvite } from "../ports/auth-intent-repository.ts"
import { createFakeAuthIntentRepository } from "../testing/fake-auth-intent-repository.ts"
import type { AuthIntent } from "../types.ts"
import { createInviteIntentUseCase, InviteAlreadyPendingError } from "./create-invite-intent.ts"

const createTestLayers = (options?: { pendingInvitesByOrganizationId?: Map<string, readonly PendingInvite[]> }) => {
  const savedIntents: AuthIntent[] = []
  const pendingByOrg = options?.pendingInvitesByOrganizationId ?? new Map()

  const { repository: authIntentRepo } = createFakeAuthIntentRepository({
    save: (intent) =>
      Effect.sync(() => {
        savedIntents.push(intent)
      }),
    findPendingInvitesByOrganizationId: (organizationId) => Effect.succeed(pendingByOrg.get(organizationId) ?? []),
  })

  const { repository: userRepo } = createFakeUserRepository()

  const testLayers = Layer.mergeAll(
    Layer.succeed(AuthIntentRepository, authIntentRepo),
    Layer.succeed(UserRepository, userRepo),
  )

  return { savedIntents, testLayers }
}

describe("createInviteIntentUseCase", () => {
  it("creates an invite intent when no pending invite exists for the email in the organization", async () => {
    const { savedIntents, testLayers } = createTestLayers()

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
    expect(savedIntents).toHaveLength(1)
    expect(savedIntents[0]?.email).toBe("invited@example.com")
  })

  it("rejects duplicate pending invite for same email and organization", async () => {
    const { savedIntents, testLayers } = createTestLayers({
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
    })

    const error = await Effect.runPromise(
      createInviteIntentUseCase({
        email: " invited@example.com ",
        organizationId: "org_1",
        organizationName: "Acme",
        inviterName: "Alice",
      }).pipe(Effect.provide(testLayers), Effect.flip),
    )

    expect(error).toBeInstanceOf(InviteAlreadyPendingError)
    expect(savedIntents).toHaveLength(0)
  })

  it("allows invite when pending invite exists for same email in another organization", async () => {
    const { savedIntents, testLayers } = createTestLayers({
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
    })

    const intent = await Effect.runPromise(
      createInviteIntentUseCase({
        email: "invited@example.com",
        organizationId: "org_1",
        organizationName: "Acme",
        inviterName: "Alice",
      }).pipe(Effect.provide(testLayers)),
    )

    expect(intent.email).toBe("invited@example.com")
    expect(savedIntents).toHaveLength(1)
  })
})
