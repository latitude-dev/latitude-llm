import { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import { AuthUserRepository } from "../ports/auth-user-repository.ts"
import type { AuthIntent } from "../types.ts"
import {
  AuthIntentEmailMismatchError,
  AuthIntentExpiredError,
  MissingSignupProvisioningDataError,
  completeAuthIntentUseCase,
} from "./complete-auth-intent.ts"

const NOW = new Date("2025-01-01T00:00:00Z")

const createIntent = (overrides: Partial<AuthIntent> = {}): AuthIntent => {
  return {
    id: "intent-1",
    type: "login",
    email: "user@example.com",
    data: {},
    existingAccountAtRequest: true,
    expiresAt: new Date(NOW.getTime() + 60_000),
    consumedAt: null,
    createdOrganizationId: null,
    ...overrides,
  }
}

const createMocks = ({ intent }: { intent: AuthIntent | null }) => {
  const markConsumed = vi.fn(() => Effect.succeed(undefined))
  const setNameIfMissing = vi.fn(() => Effect.succeed(undefined))
  const saveMembership = vi.fn(() => Effect.succeed(undefined))
  const saveOrganization = vi.fn(() => Effect.succeed(undefined))

  const intents: (typeof AuthIntentRepository)["Service"] = {
    save: vi.fn(() => Effect.succeed(undefined)),
    findById: vi.fn((id: string) =>
      intent ? Effect.succeed(intent) : Effect.fail(new NotFoundError({ entity: "AuthIntent", id })),
    ),
    findPendingInvitesByOrganizationId: vi.fn(() => Effect.succeed([])),
    markConsumed,
  }

  const organizations: (typeof OrganizationRepository)["Service"] = {
    findById: vi.fn(() => Effect.succeed({} as never)),
    findByUserId: vi.fn(() => Effect.succeed([])),
    save: saveOrganization,
    delete: vi.fn(() => Effect.succeed(undefined)),
    existsBySlug: vi.fn(() => Effect.succeed(false)),
  }

  const memberships: (typeof MembershipRepository)["Service"] = {
    findById: vi.fn(() => Effect.fail(new NotFoundError({ entity: "Membership", id: "unknown" }))),
    findByOrganizationId: vi.fn(() => Effect.succeed([])),
    findByUserId: vi.fn(() => Effect.succeed([])),
    findByOrganizationAndUser: vi.fn(() => Effect.fail(new NotFoundError({ entity: "Membership", id: "unknown" }))),
    findMembersWithUser: vi.fn(() => Effect.succeed([])),
    isMember: vi.fn(() => Effect.succeed(false)),
    isAdmin: vi.fn(() => Effect.succeed(false)),
    save: saveMembership,
    delete: vi.fn(() => Effect.succeed(undefined)),
  }

  const users: (typeof AuthUserRepository)["Service"] = {
    findByEmail: vi.fn(() => Effect.fail(new NotFoundError({ entity: "AuthUser", id: "unknown" }))),
    setNameIfMissing,
  }

  return {
    intents,
    organizations,
    memberships,
    users,
    markConsumed,
    setNameIfMissing,
    saveMembership,
    saveOrganization,
  }
}

const runWithServices = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    AuthIntentRepository | AuthUserRepository | OrganizationRepository | MembershipRepository
  >,
  mocks: ReturnType<typeof createMocks>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(AuthIntentRepository, mocks.intents),
      Effect.provideService(AuthUserRepository, mocks.users),
      Effect.provideService(OrganizationRepository, mocks.organizations),
      Effect.provideService(MembershipRepository, mocks.memberships),
    ),
  )

describe("completeAuthIntentUseCase", () => {
  const baseSession = {
    userId: "user-1",
    email: "user@example.com",
    name: "Alice",
  }

  it("returns NotFoundError when intent does not exist", async () => {
    const mocks = createMocks({ intent: null })

    await expect(
      runWithServices(
        completeAuthIntentUseCase({
          intentId: "missing-intent",
          session: baseSession,
          now: NOW,
        }),
        mocks,
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it("returns AuthIntentExpiredError for expired intents", async () => {
    const mocks = createMocks({
      intent: createIntent({ expiresAt: new Date(NOW.getTime() - 1_000) }),
    })

    await expect(
      runWithServices(
        completeAuthIntentUseCase({
          intentId: "intent-1",
          session: baseSession,
          now: NOW,
        }),
        mocks,
      ),
    ).rejects.toBeInstanceOf(AuthIntentExpiredError)
  })

  it("returns AuthIntentEmailMismatchError for mismatched session email", async () => {
    const mocks = createMocks({ intent: createIntent({ email: "user@example.com" }) })

    await expect(
      runWithServices(
        completeAuthIntentUseCase({
          intentId: "intent-1",
          session: {
            ...baseSession,
            email: "different@example.com",
          },
          now: NOW,
        }),
        mocks,
      ),
    ).rejects.toBeInstanceOf(AuthIntentEmailMismatchError)
  })

  it("returns without side effects when intent is already consumed", async () => {
    const mocks = createMocks({
      intent: createIntent({ consumedAt: new Date() }),
    })

    await runWithServices(
      completeAuthIntentUseCase({
        intentId: "intent-1",
        session: baseSession,
        now: NOW,
      }),
      mocks,
    )

    expect(mocks.markConsumed).not.toHaveBeenCalled()
    expect(mocks.saveMembership).not.toHaveBeenCalled()
    expect(mocks.saveOrganization).not.toHaveBeenCalled()
  })

  it("returns MissingSignupProvisioningDataError for signup intents without required data", async () => {
    const mocks = createMocks({
      intent: createIntent({
        type: "signup",
        existingAccountAtRequest: false,
        data: { signup: { name: "Alice", organizationName: "" } },
      }),
    })

    await expect(
      runWithServices(
        completeAuthIntentUseCase({
          intentId: "intent-1",
          session: baseSession,
          now: NOW,
        }),
        mocks,
      ),
    ).rejects.toBeInstanceOf(MissingSignupProvisioningDataError)
  })

  it("creates organization, membership, and fills missing session name for new signup", async () => {
    const mocks = createMocks({
      intent: createIntent({
        type: "signup",
        existingAccountAtRequest: false,
        data: { signup: { name: "Alice", organizationName: "Acme" } },
      }),
    })

    await runWithServices(
      completeAuthIntentUseCase({
        intentId: "intent-1",
        session: {
          ...baseSession,
          name: null,
        },
        now: NOW,
      }),
      mocks,
    )

    expect(mocks.saveOrganization).toHaveBeenCalledTimes(1)
    expect(mocks.saveMembership).toHaveBeenCalledTimes(1)
    expect(mocks.setNameIfMissing).toHaveBeenCalledWith({
      userId: "user-1",
      name: "Alice",
    })

    const membershipArg = (mocks.saveMembership.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>
    expect(membershipArg.role).toBe("owner")
    expect(membershipArg.userId).toBe("user-1")

    const markConsumedArg = (mocks.markConsumed.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>
    expect(markConsumedArg.intentId).toBe("intent-1")
    expect(markConsumedArg.createdOrganizationId).toBeTypeOf("string")
  })

  it("marks intent as consumed with membership provisioning for invite flows", async () => {
    const mocks = createMocks({
      intent: createIntent({
        type: "invite",
        data: {
          invite: {
            organizationId: "org-1",
            organizationName: "Test Org",
            inviterName: "Test User",
          },
        },
      }),
    })

    await runWithServices(
      completeAuthIntentUseCase({
        intentId: "intent-1",
        session: {
          ...baseSession,
          email: " User@Example.com ",
        },
        now: NOW,
      }),
      mocks,
    )

    expect(mocks.markConsumed).toHaveBeenCalledWith({ intentId: "intent-1" })
    expect(mocks.saveOrganization).not.toHaveBeenCalled()
    expect(mocks.saveMembership).toHaveBeenCalled()
    expect(mocks.setNameIfMissing).toHaveBeenCalled()
  })

  it("only marks intent as consumed for login flows", async () => {
    const mocks = createMocks({
      intent: createIntent({ type: "login" }),
    })

    await runWithServices(
      completeAuthIntentUseCase({
        intentId: "intent-1",
        session: baseSession,
        now: NOW,
      }),
      mocks,
    )

    expect(mocks.markConsumed).toHaveBeenCalledWith({ intentId: "intent-1" })
    expect(mocks.saveOrganization).not.toHaveBeenCalled()
    expect(mocks.saveMembership).not.toHaveBeenCalled()
    expect(mocks.setNameIfMissing).not.toHaveBeenCalled()
  })

  it("only marks intent as consumed for signup with existing account", async () => {
    const mocks = createMocks({
      intent: createIntent({
        type: "signup",
        existingAccountAtRequest: true,
        data: { signup: { name: "Alice", organizationName: "Acme" } },
      }),
    })

    await runWithServices(
      completeAuthIntentUseCase({
        intentId: "intent-1",
        session: baseSession,
        now: NOW,
      }),
      mocks,
    )

    expect(mocks.markConsumed).toHaveBeenCalledWith({ intentId: "intent-1" })
    expect(mocks.saveOrganization).not.toHaveBeenCalled()
    expect(mocks.saveMembership).not.toHaveBeenCalled()
  })
})
