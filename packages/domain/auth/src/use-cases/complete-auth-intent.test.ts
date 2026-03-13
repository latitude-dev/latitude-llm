import { type Membership, MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { NotFoundError, OrganizationId, SqlClient, toRepositoryError } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
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
  expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
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

// --- Fake Repositories ---

interface FakeAuthIntentRepo {
  intents: Map<string, AuthIntent>
  consumed: Map<string, { intentId: string; createdOrganizationId?: string }>
}

const createFakeAuthIntentRepository = (fake: FakeAuthIntentRepo) => ({
  save: (intent: AuthIntent) =>
    Effect.sync(() => {
      fake.intents.set(intent.id, intent)
    }),

  findById: (id: string) =>
    Effect.gen(function* () {
      const intent = fake.intents.get(id)
      if (!intent) {
        return yield* new NotFoundError({ entity: "AuthIntent", id })
      }
      return intent
    }),

  markConsumed: (params: { intentId: string; createdOrganizationId?: string }) =>
    Effect.sync(() => {
      fake.consumed.set(params.intentId, params)
      const intent = fake.intents.get(params.intentId)
      if (intent) {
        fake.intents.set(params.intentId, { ...intent, consumedAt: new Date() })
      }
    }),

  findPendingInvitesByOrganizationId: () => Effect.succeed([] as const),
})

interface FakeUserRepo {
  names: Map<string, string>
}

const createFakeUserRepository = (fake: FakeUserRepo) => ({
  findByEmail: (_email: string) => Effect.fail(new NotFoundError({ entity: "User", id: _email })),

  setNameIfMissing: (params: { userId: string; name: string }) =>
    Effect.sync(() => {
      if (params.name.trim()) {
        fake.names.set(params.userId, params.name.trim())
      }
    }),
})

interface FakeMembershipRepo {
  memberships: Map<string, Membership>
}

const createFakeMembershipRepository = (fake: FakeMembershipRepo) => ({
  findById: (_id: string) => Effect.fail(new NotFoundError({ entity: "Membership", id: _id })),

  findByOrganizationId: () => Effect.succeed([]),

  findByUserId: () => Effect.succeed([]),

  findByOrganizationAndUser: () => Effect.fail(new NotFoundError({ entity: "Membership", id: "" })),

  findMembersWithUser: () => Effect.succeed([]),

  isMember: () => Effect.succeed(false),

  isAdmin: () => Effect.succeed(false),

  save: (membership: Membership) =>
    Effect.sync(() => {
      fake.memberships.set(membership.id, membership)
    }),

  delete: () => Effect.succeed(undefined),
})

interface FakeOrganizationRepo {
  organizations: Map<string, { id: string; name: string; slug: string }>
  saved: { id: string; name: string; slug: string; creatorId: string }[]
}

const createFakeOrganizationRepository = (fake: FakeOrganizationRepo) => ({
  findById: (id: OrganizationId) =>
    Effect.gen(function* () {
      const org = fake.organizations.get(id)
      if (!org) {
        return yield* new NotFoundError({ entity: "Organization", id })
      }
      return {
        id: OrganizationId(org.id),
        name: org.name,
        slug: org.slug,
        logo: null,
        metadata: null,
        creatorId: null,
        currentSubscriptionId: null,
        stripeCustomerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    }),

  findByUserId: () => Effect.succeed([]),

  save: (org: {
    id: OrganizationId
    name: string
    slug: string
    logo: string | null
    metadata: string | null
    creatorId: string | null
    currentSubscriptionId: string | null
    stripeCustomerId: string | null
    createdAt: Date
    updatedAt: Date
  }) =>
    Effect.sync(() => {
      fake.saved.push({
        id: org.id,
        name: org.name,
        slug: org.slug,
        creatorId: org.creatorId ?? "",
      })
      fake.organizations.set(org.id, { id: org.id, name: org.name, slug: org.slug })
    }),

  delete: () => Effect.succeed(undefined),

  existsBySlug: () => Effect.succeed(false),
})

// --- Test Helpers ---

const createTestLayers = () => {
  const fakeAuthIntents: FakeAuthIntentRepo = {
    intents: new Map(),
    consumed: new Map(),
  }
  const fakeUsers: FakeUserRepo = {
    names: new Map(),
  }
  const fakeMemberships: FakeMembershipRepo = {
    memberships: new Map(),
  }

  const fakeOrganizations: FakeOrganizationRepo = {
    organizations: new Map(),
    saved: [],
  }

  const fakeSqlClient: import("@domain/shared").SqlClientShape = {
    organizationId: OrganizationId("system"),
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: <T>(_fn: (tx: unknown, organizationId: OrganizationId) => Promise<T>) =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: () => Promise.resolve([] as unknown as T),
          catch: (error) => toRepositoryError(error, "query"),
        })
        return result
      }),
  }

  const AuthIntentRepositoryTest = Layer.succeed(AuthIntentRepository, createFakeAuthIntentRepository(fakeAuthIntents))

  const UserRepositoryTest = Layer.succeed(UserRepository, createFakeUserRepository(fakeUsers))

  const MembershipRepositoryTest = Layer.succeed(MembershipRepository, createFakeMembershipRepository(fakeMemberships))

  const OrganizationRepositoryTest = Layer.succeed(
    OrganizationRepository,
    createFakeOrganizationRepository(fakeOrganizations),
  )

  const SqlClientTest = Layer.succeed(SqlClient, fakeSqlClient)

  return {
    fakeAuthIntents,
    fakeUsers,
    fakeMemberships,
    fakeOrganizations,
    testLayers: Layer.mergeAll(
      AuthIntentRepositoryTest,
      UserRepositoryTest,
      MembershipRepositoryTest,
      OrganizationRepositoryTest,
      SqlClientTest,
    ),
  }
}

// Helper to run effect and assert error type
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
    fakeAuthIntents.intents.set(expiredIntent.id, expiredIntent)

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
    fakeAuthIntents.intents.set(intent.id, intent)

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
    fakeAuthIntents.intents.set(consumedIntent.id, consumedIntent)

    const session = createTestSession()
    const program = completeAuthIntentUseCase({
      intentId: consumedIntent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    const result = await Effect.runPromise(program)

    expect(result).toBeUndefined()
  })

  it("handles login intent by marking it consumed", async () => {
    const { fakeAuthIntents, testLayers } = createTestLayers()
    const loginIntent = createTestAuthIntent({ type: "login" })
    fakeAuthIntents.intents.set(loginIntent.id, loginIntent)

    const session = createTestSession()
    const program = completeAuthIntentUseCase({
      intentId: loginIntent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    await Effect.runPromise(program)

    expect(fakeAuthIntents.consumed.size).toBe(1)
    expect(fakeAuthIntents.consumed.get(loginIntent.id)?.intentId).toBe(loginIntent.id)
  })

  it("skips organization creation for signup when existingAccountAtRequest is true", async () => {
    const { fakeAuthIntents, fakeOrganizations, testLayers } = createTestLayers()
    const signupIntent = createTestAuthIntent({
      type: "signup",
      existingAccountAtRequest: true,
      data: {},
    })
    fakeAuthIntents.intents.set(signupIntent.id, signupIntent)

    const session = createTestSession()
    const program = completeAuthIntentUseCase({
      intentId: signupIntent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    await Effect.runPromise(program)

    expect(fakeOrganizations.saved).toHaveLength(0)
    expect(fakeAuthIntents.consumed.size).toBe(1)
    expect(fakeAuthIntents.consumed.get(signupIntent.id)?.intentId).toBe(signupIntent.id)
  })

  it("returns MissingInviteDataError when invite data is missing", async () => {
    const { fakeAuthIntents, testLayers } = createTestLayers()
    const inviteIntent = createTestAuthIntent({
      type: "invite",
      data: {},
    })
    fakeAuthIntents.intents.set(inviteIntent.id, inviteIntent)

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
    fakeAuthIntents.intents.set(unknownIntent.id, unknownIntent)

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
    fakeAuthIntents.intents.set(intent.id, intent)

    const session = createTestSession({ email: "user@example.com" })
    const program = completeAuthIntentUseCase({
      intentId: intent.id,
      session,
    }).pipe(Effect.provide(testLayers))

    const exit = await Effect.runPromiseExit(program)

    // Should not be an email mismatch error
    if (Exit.isFailure(exit)) {
      const reasons = (exit.cause as unknown as { reasons: Array<{ _tag: string; error: unknown }> }).reasons
      const failReason = reasons.find((r) => r._tag === "Fail")
      expect(failReason?.error).not.toBeInstanceOf(AuthIntentEmailMismatchError)
    }
  })
})
