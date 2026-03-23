import { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { createFakeMembershipRepository, createFakeOrganizationRepository } from "@domain/organizations/testing"
import { SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { UserRepository } from "@domain/users"
import { createFakeUserRepository } from "@domain/users/testing"
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import { createFakeAuthIntentRepository } from "../testing/fake-auth-intent-repository.ts"
import type { AuthIntent } from "../types.ts"
import {
  AuthIntentEmailMismatchError,
  AuthIntentExpiredError,
  completeAuthIntentUseCase,
  InvalidAuthIntentTypeError,
  MissingInviteDataError,
} from "./complete-auth-intent.ts"

// --- Test Fixtures ---

const createTestAuthIntent = (overrides: Partial<AuthIntent> = {}): AuthIntent => ({
  id: "intent_123",
  type: "login",
  email: "user@example.com",
  data: {},
  existingAccountAtRequest: false,
  expiresAt: new Date(Date.now() + 3600000),
  consumedAt: null,
  createdOrganizationId: null,
  ...overrides,
})

const createTestSession = (overrides: { userId?: string; email?: string; name?: string | null } = {}) => ({
  userId: "user_123",
  email: "user@example.com",
  name: null,
  ...overrides,
})

// --- Test Helpers ---

const createTestLayers = () => {
  const { repository: authIntentRepo, intents: fakeAuthIntents, consumed } = createFakeAuthIntentRepository()
  const { repository: userRepo, namesSet: fakeUserNames } = createFakeUserRepository()
  const { repository: membershipRepo, memberships: fakeMemberships } = createFakeMembershipRepository()
  const { repository: organizationRepo, organizations: fakeOrganizations } = createFakeOrganizationRepository()
  const fakeSqlClient = createFakeSqlClient()

  const testLayers = Layer.mergeAll(
    Layer.succeed(AuthIntentRepository, authIntentRepo),
    Layer.succeed(UserRepository, userRepo),
    Layer.succeed(MembershipRepository, membershipRepo),
    Layer.succeed(OrganizationRepository, organizationRepo),
    Layer.succeed(SqlClient, fakeSqlClient),
  )

  return {
    fakeAuthIntents,
    consumed,
    fakeUserNames,
    fakeMemberships,
    fakeOrganizations,
    testLayers,
  }
}

async function runAndExpectError<T, E>(
  program: Effect.Effect<T, E, never>,
  expectedError: new (...args: never[]) => E,
): Promise<void> {
  const exit = await Effect.runPromiseExit(program)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) {
    const reasons = (exit.cause as unknown as { reasons: Array<{ _tag: string; error: unknown }> }).reasons
    const failReason = reasons.find((r) => r._tag === "Fail")
    if (failReason) {
      expect(failReason.error).toBeInstanceOf(expectedError)
    } else {
      throw new Error("Expected failure but no Fail reason found in cause")
    }
  }
}

// --- Tests ---

describe("completeAuthIntentUseCase", () => {
  it("returns AuthIntentExpiredError when intent has expired", async () => {
    const { fakeAuthIntents, testLayers } = createTestLayers()
    const expiredIntent = createTestAuthIntent({
      expiresAt: new Date(Date.now() - 1000),
    })
    fakeAuthIntents.set(expiredIntent.id, expiredIntent)

    const session = createTestSession()
    const program = completeAuthIntentUseCase({
      intentId: expiredIntent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    await runAndExpectError(program, AuthIntentExpiredError)
  })

  it("returns AuthIntentEmailMismatchError when emails don't match", async () => {
    const { fakeAuthIntents, testLayers } = createTestLayers()
    const intent = createTestAuthIntent({ email: "user@example.com" })
    fakeAuthIntents.set(intent.id, intent)

    const session = createTestSession({ email: "different@example.com" })
    const program = completeAuthIntentUseCase({
      intentId: intent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    await runAndExpectError(program, AuthIntentEmailMismatchError)
  })

  it("returns undefined when intent is already consumed", async () => {
    const { fakeAuthIntents, testLayers } = createTestLayers()
    const consumedIntent = createTestAuthIntent({
      consumedAt: new Date(),
    })
    fakeAuthIntents.set(consumedIntent.id, consumedIntent)

    const session = createTestSession()
    const program = completeAuthIntentUseCase({
      intentId: consumedIntent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    const result = await Effect.runPromise(program)

    expect(result).toBeUndefined()
  })

  it("handles login intent by marking it consumed", async () => {
    const { fakeAuthIntents, consumed, testLayers } = createTestLayers()
    const loginIntent = createTestAuthIntent({ type: "login" })
    fakeAuthIntents.set(loginIntent.id, loginIntent)

    const session = createTestSession()
    const program = completeAuthIntentUseCase({
      intentId: loginIntent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    await Effect.runPromise(program)

    expect(consumed.size).toBe(1)
    expect(consumed.get(loginIntent.id)?.intentId).toBe(loginIntent.id)
  })

  it("skips organization creation for signup when existingAccountAtRequest is true", async () => {
    const { fakeAuthIntents, consumed, fakeOrganizations, testLayers } = createTestLayers()
    const signupIntent = createTestAuthIntent({
      type: "signup",
      existingAccountAtRequest: true,
      data: {},
    })
    fakeAuthIntents.set(signupIntent.id, signupIntent)

    const session = createTestSession()
    const program = completeAuthIntentUseCase({
      intentId: signupIntent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    await Effect.runPromise(program)

    expect(fakeOrganizations.size).toBe(0)
    expect(consumed.size).toBe(1)
    expect(consumed.get(signupIntent.id)?.intentId).toBe(signupIntent.id)
  })

  it("returns MissingInviteDataError when invite data is missing", async () => {
    const { fakeAuthIntents, testLayers } = createTestLayers()
    const inviteIntent = createTestAuthIntent({
      type: "invite",
      data: {},
    })
    fakeAuthIntents.set(inviteIntent.id, inviteIntent)

    const session = createTestSession()
    const program = completeAuthIntentUseCase({
      intentId: inviteIntent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    await runAndExpectError(program, MissingInviteDataError)
  })

  it("returns InvalidAuthIntentTypeError for unknown intent types", async () => {
    const { fakeAuthIntents, testLayers } = createTestLayers()
    const unknownIntent = createTestAuthIntent({
      type: "unknown" as "login",
    })
    fakeAuthIntents.set(unknownIntent.id, unknownIntent)

    const session = createTestSession()
    const program = completeAuthIntentUseCase({
      intentId: unknownIntent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    await runAndExpectError(program, InvalidAuthIntentTypeError)
  })

  it("normalizes email comparison (case insensitive)", async () => {
    const { fakeAuthIntents, testLayers } = createTestLayers()
    const intent = createTestAuthIntent({ email: "USER@EXAMPLE.COM" })
    fakeAuthIntents.set(intent.id, intent)

    const session = createTestSession({ email: "user@example.com" })
    const program = completeAuthIntentUseCase({
      intentId: intent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    const exit = await Effect.runPromiseExit(program)

    if (Exit.isFailure(exit)) {
      const reasons = (exit.cause as unknown as { reasons: Array<{ _tag: string; error: unknown }> }).reasons
      const failReason = reasons.find((r) => r._tag === "Fail")
      expect(failReason?.error).not.toBeInstanceOf(AuthIntentEmailMismatchError)
    }
  })
})
