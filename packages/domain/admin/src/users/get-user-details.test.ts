import { NotFoundError, type UserId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { getUserDetailsUseCase } from "./get-user-details.ts"
import type { AdminUserDetails } from "./user-details.ts"
import { AdminUserRepository } from "./user-repository.ts"

const TARGET_ID = "user-target" as UserId

const successfulRepo = (result: AdminUserDetails) =>
  Layer.succeed(AdminUserRepository, {
    findById: () => Effect.succeed(result),
  })

const missingRepo = () =>
  Layer.succeed(AdminUserRepository, {
    findById: (id) => Effect.fail(new NotFoundError({ entity: "User", id })),
  })

const mkDetails = (overrides: Partial<AdminUserDetails> = {}): AdminUserDetails => ({
  id: TARGET_ID,
  email: "target@example.com",
  name: "Target User",
  image: null,
  role: "user",
  memberships: [],
  sessions: [],
  createdAt: new Date("2024-01-01"),
  ...overrides,
})

describe("getUserDetailsUseCase", () => {
  it("returns the admin user details from the repository on success", async () => {
    const details = mkDetails()
    const result = await Effect.runPromise(
      getUserDetailsUseCase({ userId: TARGET_ID }).pipe(Effect.provide(successfulRepo(details))),
    )

    expect(result).toBe(details)
  })

  it("surfaces NotFoundError verbatim when the repo does not find the user", async () => {
    await expect(
      Effect.runPromise(getUserDetailsUseCase({ userId: TARGET_ID }).pipe(Effect.provide(missingRepo()))),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "User" })
  })
})
