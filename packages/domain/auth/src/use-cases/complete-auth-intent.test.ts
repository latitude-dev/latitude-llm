import type { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import type { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import type { AuthUserRepository } from "../ports/auth-user-repository.ts"
import type { AuthIntent } from "../types.ts"
import {
  AuthIntentEmailMismatchError,
  AuthIntentExpiredError,
  AuthIntentNotFoundError,
  MissingSignupProvisioningDataError,
  completeAuthIntentUseCase,
} from "./complete-auth-intent.ts"

const createIntent = (overrides: Partial<AuthIntent> = {}): AuthIntent => {
  return {
    id: "intent-1",
    type: "login",
    email: "user@example.com",
    data: {},
    existingAccountAtRequest: true,
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    createdOrganizationId: null,
    ...overrides,
  }
}

const createDeps = ({
  intent,
}: {
  intent: AuthIntent | null
}): {
  intents: AuthIntentRepository
  organizations: OrganizationRepository
  memberships: MembershipRepository
  users: AuthUserRepository
  markConsumed: ReturnType<typeof vi.fn>
  setNameIfMissing: ReturnType<typeof vi.fn>
  saveMembership: ReturnType<typeof vi.fn>
  saveOrganization: ReturnType<typeof vi.fn>
} => {
  const markConsumed = vi.fn(() => Effect.succeed(undefined))
  const setNameIfMissing = vi.fn(() => Effect.succeed(undefined))
  const saveMembership = vi.fn(() => Effect.succeed(undefined))
  const saveOrganization = vi.fn(() => Effect.succeed(undefined))

  const intents: AuthIntentRepository = {
    save: vi.fn(() => Effect.succeed(undefined)),
    findById: vi.fn(() => Effect.succeed(intent)),
    markConsumed,
  }

  const organizations: OrganizationRepository = {
    findById: vi.fn(() => Effect.succeed({} as never)),
    findByUserId: vi.fn(() => Effect.succeed([])),
    save: saveOrganization,
    delete: vi.fn(() => Effect.succeed(undefined)),
    existsBySlug: vi.fn(() => Effect.succeed(false)),
  }

  const memberships: MembershipRepository = {
    findById: vi.fn(() => Effect.succeed(null)),
    findByOrganizationId: vi.fn(() => Effect.succeed([])),
    findByUserId: vi.fn(() => Effect.succeed([])),
    findByOrganizationAndUser: vi.fn(() => Effect.succeed(null)),
    isMember: vi.fn(() => Effect.succeed(false)),
    isAdmin: vi.fn(() => Effect.succeed(false)),
    save: saveMembership,
    delete: vi.fn(() => Effect.succeed(undefined)),
  }

  const users: AuthUserRepository = {
    findByEmail: vi.fn(() => Effect.succeed(null)),
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

describe("completeAuthIntentUseCase", () => {
  const baseSession = {
    userId: "user-1",
    email: "user@example.com",
    name: "Alice",
  }

  it("returns AuthIntentNotFoundError when intent does not exist", async () => {
    const deps = createDeps({ intent: null })
    const execute = completeAuthIntentUseCase(deps)

    await expect(
      Effect.runPromise(
        execute({
          intentId: "missing-intent",
          session: baseSession,
        }),
      ),
    ).rejects.toBeInstanceOf(AuthIntentNotFoundError)
  })

  it("returns AuthIntentExpiredError for expired intents", async () => {
    const deps = createDeps({
      intent: createIntent({ expiresAt: new Date(Date.now() - 1_000) }),
    })
    const execute = completeAuthIntentUseCase(deps)

    await expect(
      Effect.runPromise(
        execute({
          intentId: "intent-1",
          session: baseSession,
        }),
      ),
    ).rejects.toBeInstanceOf(AuthIntentExpiredError)
  })

  it("returns AuthIntentEmailMismatchError for mismatched session email", async () => {
    const deps = createDeps({ intent: createIntent({ email: "user@example.com" }) })
    const execute = completeAuthIntentUseCase(deps)

    await expect(
      Effect.runPromise(
        execute({
          intentId: "intent-1",
          session: {
            ...baseSession,
            email: "different@example.com",
          },
        }),
      ),
    ).rejects.toBeInstanceOf(AuthIntentEmailMismatchError)
  })

  it("returns completed without side effects when intent is already consumed", async () => {
    const deps = createDeps({
      intent: createIntent({ consumedAt: new Date() }),
    })
    const execute = completeAuthIntentUseCase(deps)

    const result = await Effect.runPromise(
      execute({
        intentId: "intent-1",
        session: baseSession,
      }),
    )

    expect(result).toEqual({ completed: true })
    expect(deps.markConsumed).not.toHaveBeenCalled()
    expect(deps.saveMembership).not.toHaveBeenCalled()
    expect(deps.saveOrganization).not.toHaveBeenCalled()
  })

  it("returns MissingSignupProvisioningDataError for signup intents without required data", async () => {
    const deps = createDeps({
      intent: createIntent({
        type: "signup",
        existingAccountAtRequest: false,
        data: { signup: { name: "Alice", organizationName: "" } },
      }),
    })
    const execute = completeAuthIntentUseCase(deps)

    await expect(
      Effect.runPromise(
        execute({
          intentId: "intent-1",
          session: baseSession,
        }),
      ),
    ).rejects.toBeInstanceOf(MissingSignupProvisioningDataError)
  })

  it("creates organization, membership, and fills missing session name for new signup", async () => {
    const deps = createDeps({
      intent: createIntent({
        type: "signup",
        existingAccountAtRequest: false,
        data: { signup: { name: "Alice", organizationName: "Acme" } },
      }),
    })
    const execute = completeAuthIntentUseCase(deps)

    const result = await Effect.runPromise(
      execute({
        intentId: "intent-1",
        session: {
          ...baseSession,
          name: null,
        },
      }),
    )

    expect(result).toEqual({ completed: true })
    expect(deps.saveOrganization).toHaveBeenCalledTimes(1)
    expect(deps.saveMembership).toHaveBeenCalledTimes(1)
    expect(deps.setNameIfMissing).toHaveBeenCalledWith({
      userId: "user-1",
      name: "Alice",
    })

    const membershipArg = deps.saveMembership.mock.calls[0]?.[0]
    expect(membershipArg.role).toBe("owner")
    expect(membershipArg.userId).toBe("user-1")

    const markConsumedArg = deps.markConsumed.mock.calls[0]?.[0]
    expect(markConsumedArg.intentId).toBe("intent-1")
    expect(markConsumedArg.createdOrganizationId).toBeTypeOf("string")
  })

  it("marks intent as consumed without organization provisioning for non-signup flows", async () => {
    const deps = createDeps({ intent: createIntent({ type: "invite" }) })
    const execute = completeAuthIntentUseCase(deps)

    const result = await Effect.runPromise(
      execute({
        intentId: "intent-1",
        session: {
          ...baseSession,
          email: " User@Example.com ",
        },
      }),
    )

    expect(result).toEqual({ completed: true })
    expect(deps.markConsumed).toHaveBeenCalledWith({ intentId: "intent-1" })
    expect(deps.saveOrganization).not.toHaveBeenCalled()
    expect(deps.saveMembership).not.toHaveBeenCalled()
    expect(deps.setNameIfMissing).not.toHaveBeenCalled()
  })
})
