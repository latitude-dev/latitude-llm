import { NotFoundError, type UserId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { getActiveSessionTokenUseCase } from "./get-active-session-token.ts"
import { AdminUserRepository } from "./user-repository.ts"

const USER_ID = "user-target" as UserId
const SESSION_ID = "sess-abc"

const successfulRepo = (token: string) =>
  Layer.succeed(AdminUserRepository, {
    findById: () => Effect.fail(new NotFoundError({ entity: "User", id: USER_ID })),
    findActiveSessionTokenForUser: () => Effect.succeed(token),
  })

const missingRepo = () =>
  Layer.succeed(AdminUserRepository, {
    findById: () => Effect.fail(new NotFoundError({ entity: "User", id: USER_ID })),
    findActiveSessionTokenForUser: (_uid, sessionId) =>
      Effect.fail(new NotFoundError({ entity: "Session", id: sessionId })),
  })

describe("getActiveSessionTokenUseCase", () => {
  it("returns the token from the repository on success", async () => {
    const result = await Effect.runPromise(
      getActiveSessionTokenUseCase({ userId: USER_ID, sessionId: SESSION_ID }).pipe(
        Effect.provide(successfulRepo("tok-live")),
      ),
    )

    expect(result).toBe("tok-live")
  })

  it("surfaces NotFoundError verbatim when the repo does not find a matching session", async () => {
    await expect(
      Effect.runPromise(
        getActiveSessionTokenUseCase({ userId: USER_ID, sessionId: SESSION_ID }).pipe(Effect.provide(missingRepo())),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Session" })
  })
})
