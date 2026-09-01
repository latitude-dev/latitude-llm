import { ApiKeyRepository } from "@domain/api-keys"
import { generateId, isNotFoundError, OrganizationId, type SqlClient } from "@domain/shared"
import { encrypt, hash } from "@repo/utils"
import { Cause, Effect, Exit } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { apiKeys } from "../schema/api-keys.ts"
import { organizations } from "../schema/better-auth.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { ApiKeyRepositoryLive } from "./api-key-repository.ts"

const TEST_ENCRYPTION_KEY_HEX = "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"
const TEST_ENCRYPTION_KEY = Buffer.from(TEST_ENCRYPTION_KEY_HEX, "hex")

beforeAll(() => {
  process.env.LAT_MASTER_ENCRYPTION_KEY = process.env.LAT_MASTER_ENCRYPTION_KEY ?? TEST_ENCRYPTION_KEY_HEX
})

const pg = setupTestPostgres()

const run = <A, E>(effect: Effect.Effect<A, E, ApiKeyRepository | SqlClient>, organizationId: OrganizationId) =>
  Effect.runPromiseExit(effect.pipe(withPostgres(ApiKeyRepositoryLive, pg.adminPostgresClient, organizationId)))

const createOrganization = async () => {
  const id = generateId()
  await pg.db.insert(organizations).values({ id, name: "Acme", slug: `acme-${id}` })
  return OrganizationId(id)
}

const insertApiKey = async (organizationId: OrganizationId, options: { readonly deletedAt?: Date } = {}) => {
  const token = `lat_test_${generateId()}`
  const tokenHash = await Effect.runPromise(hash(token))
  const id = generateId()
  await pg.db.insert(apiKeys).values({
    id,
    organizationId,
    token: await Effect.runPromise(encrypt(token, TEST_ENCRYPTION_KEY)),
    tokenHash,
    name: "test-key",
    deletedAt: options.deletedAt ?? null,
  })
  return { id, token, tokenHash }
}

const expectNotFound = (exit: Exit.Exit<unknown, unknown>) => {
  const error = Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : undefined
  expect(isNotFoundError(error)).toBe(true)
}

describe("ApiKeyRepositoryLive.findByTokenHash", () => {
  it("resolves an active key", async () => {
    const organizationId = await createOrganization()
    const apiKey = await insertApiKey(organizationId)

    const exit = await run(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo.findByTokenHash(apiKey.tokenHash)
      }),
      organizationId,
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value.id).toBe(apiKey.id)
      expect(exit.value.token).toBe(apiKey.token)
      expect(exit.value.deletedAt).toBeNull()
    }
  })

  it("does not resolve a revoked key", async () => {
    const organizationId = await createOrganization()
    const apiKey = await insertApiKey(organizationId, { deletedAt: new Date() })

    const exit = await run(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo.findByTokenHash(apiKey.tokenHash)
      }),
      organizationId,
    )

    expectNotFound(exit)
  })

  it("stops resolving a key once it is revoked", async () => {
    const organizationId = await createOrganization()
    const apiKey = await insertApiKey(organizationId)

    const revoked = await run(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        const found = yield* repo.findByTokenHash(apiKey.tokenHash)
        yield* repo.save({ ...found, deletedAt: new Date() })
      }),
      organizationId,
    )
    expect(Exit.isSuccess(revoked)).toBe(true)

    const exit = await run(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo.findByTokenHash(apiKey.tokenHash)
      }),
      organizationId,
    )

    expectNotFound(exit)
  })
})
