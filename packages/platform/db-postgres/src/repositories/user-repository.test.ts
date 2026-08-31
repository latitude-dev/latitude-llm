import { type SqlClient, UserId } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { Effect, Exit } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { users } from "../schema/better-auth.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { UserRepositoryLive } from "./user-repository.ts"

const USER_ID = UserId("u".repeat(24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, UserRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(UserRepositoryLive, pg.adminPostgresClient)))

const runExit = <A, E>(effect: Effect.Effect<A, E, UserRepository | SqlClient>) =>
  Effect.runPromiseExit(effect.pipe(withPostgres(UserRepositoryLive, pg.adminPostgresClient)))

describe("UserRepositoryLive", () => {
  afterEach(async () => {
    await pg.db.delete(users)
  })

  it("create inserts an unverified, unnamed user the way partner provisioning needs", async () => {
    const created = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* UserRepository
        return yield* repo.create({ id: USER_ID, name: "", email: "founder@longitude.example", emailVerified: false })
      }),
    )

    expect(created).toMatchObject({
      id: USER_ID,
      name: "",
      email: "founder@longitude.example",
      emailVerified: false,
      role: "user",
    })
  })

  it("create fails when the email is already taken", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* UserRepository
        yield* repo.create({ id: USER_ID, name: "", email: "taken@longitude.example", emailVerified: false })
      }),
    )

    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* UserRepository
        yield* repo.create({
          id: UserId("v".repeat(24)),
          name: "",
          email: "taken@longitude.example",
          emailVerified: false,
        })
      }),
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("create normalizes the address, so the stored row is always lowercase", async () => {
    const created = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* UserRepository
        return yield* repo.create({
          id: USER_ID,
          name: "",
          email: "Mixed.Case@Longitude.Example",
          emailVerified: false,
        })
      }),
    )

    expect(created.email).toBe("mixed.case@longitude.example")
    const [row] = await pg.db.select({ email: users.email }).from(users)
    expect(row?.email).toBe("mixed.case@longitude.example")
  })

  it("findOptionalByEmail normalizes the lookup and returns null when absent", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* UserRepository
        yield* repo.create({ id: USER_ID, name: "", email: "mixed.case@longitude.example", emailVerified: false })
      }),
    )

    const [found, missing] = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* UserRepository
        return [
          yield* repo.findOptionalByEmail("Mixed.Case@Longitude.Example"),
          yield* repo.findOptionalByEmail("nobody@longitude.example"),
        ] as const
      }),
    )

    expect(found?.id).toBe(USER_ID)
    expect(missing).toBeNull()
  })
})
