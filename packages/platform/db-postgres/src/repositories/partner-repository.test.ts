import { createPartner, PartnerRepository } from "@domain/partners"
import { PartnerId, type SqlClient } from "@domain/shared"
import { eq } from "drizzle-orm"
import { Cause, Effect, Exit } from "effect"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { partners } from "../schema/partners.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { PartnerRepositoryLive } from "./partner-repository.ts"

// Same 32-byte hex key as .env.test for parity. Set on process.env so
// the repository's getEncryptionKey() resolves without ambient .env load.
beforeAll(() => {
  process.env.LAT_MASTER_ENCRYPTION_KEY =
    process.env.LAT_MASTER_ENCRYPTION_KEY ?? "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"
})

const PARTNER_A = PartnerId("a".repeat(24))
const PARTNER_B = PartnerId("b".repeat(24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, PartnerRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(PartnerRepositoryLive, pg.adminPostgresClient)))

const runExit = <A, E>(effect: Effect.Effect<A, E, PartnerRepository | SqlClient>) =>
  Effect.runPromiseExit(effect.pipe(withPostgres(PartnerRepositoryLive, pg.adminPostgresClient)))

const savePartner = (
  overrides: Partial<Parameters<typeof createPartner>[0]> = {},
  options: { readonly hmacSecret?: string } = { hmacSecret: "secret-value" },
) =>
  runWithLive(
    Effect.gen(function* () {
      const repo = yield* PartnerRepository
      const partner = createPartner({
        id: PARTNER_A,
        name: "Longitude",
        iconUrl: "https://longitude.example/icon.png",
        redirectUrls: ["https://longitude.example/oauth/callback"],
        scopes: ["accounts:provision"],
        allowedIps: ["203.0.113.0/24"],
        ...overrides,
      })
      yield* repo.save(partner, options)
      return partner
    }),
  )

describe("PartnerRepositoryLive", () => {
  afterEach(async () => {
    await pg.db.delete(partners)
  })

  it("round-trips a partner without ever surfacing the secret on the entity", async () => {
    await savePartner()

    const partner = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        return yield* repo.findById(PARTNER_A)
      }),
    )

    expect(partner).toMatchObject({
      id: PARTNER_A,
      name: "Longitude",
      iconUrl: "https://longitude.example/icon.png",
      scopes: ["accounts:provision"],
      allowedIps: ["203.0.113.0/24"],
      enabled: true,
      deletedAt: null,
    })
    expect(partner).not.toHaveProperty("hmacSecret")
  })

  it("encrypts the secret at rest and decrypts it back through findSecretById", async () => {
    await savePartner({}, { hmacSecret: "super-secret-hmac" })

    const [row] = await pg.db.select().from(partners)
    expect(row?.hmacSecret).not.toBe("super-secret-hmac")
    expect(row?.hmacSecret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/)

    const secret = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        return yield* repo.findSecretById(PARTNER_A)
      }),
    )

    expect(secret).toBe("super-secret-hmac")
  })

  it("rotation replaces the stored secret outright", async () => {
    const partner = await savePartner({}, { hmacSecret: "old-secret" })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        yield* repo.save(partner, { hmacSecret: "new-secret" })
      }),
    )

    const secret = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        return yield* repo.findSecretById(PARTNER_A)
      }),
    )

    expect(secret).toBe("new-secret")
  })

  it("save without a secret updates the record and leaves the ciphertext untouched", async () => {
    const partner = await savePartner({}, { hmacSecret: "keep-me" })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        yield* repo.save({ ...partner, name: "Longitude Renamed", enabled: false, allowedIps: [] })
      }),
    )

    const [updated, secret] = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        return [yield* repo.findById(PARTNER_A), yield* repo.findSecretById(PARTNER_A)] as const
      }),
    )

    expect(updated.name).toBe("Longitude Renamed")
    expect(updated.enabled).toBe(false)
    expect(updated.allowedIps).toEqual([])
    expect(secret).toBe("keep-me")
  })

  it("soft delete hides the partner from findById, findSecretById and list", async () => {
    await savePartner()

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        yield* repo.softDelete(PARTNER_A)
      }),
    )

    const findExit = await runExit(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        return yield* repo.findById(PARTNER_A)
      }),
    )
    const secretExit = await runExit(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        return yield* repo.findSecretById(PARTNER_A)
      }),
    )
    const listed = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        return yield* repo.list()
      }),
    )

    expect(Exit.isFailure(findExit)).toBe(true)
    expect(Exit.isFailure(secretExit)).toBe(true)
    expect(listed).toHaveLength(0)
  })

  it("soft-deleting an already-deleted partner fails as not found", async () => {
    await savePartner()

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        yield* repo.softDelete(PARTNER_A)
      }),
    )
    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        yield* repo.softDelete(PARTNER_A)
      }),
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("list returns disabled partners, newest first", async () => {
    await savePartner({ id: PARTNER_A, name: "Older", createdAt: new Date("2026-01-01T00:00:00Z") })
    await savePartner({
      id: PARTNER_B,
      name: "Newer",
      enabled: false,
      createdAt: new Date("2026-02-01T00:00:00Z"),
    })

    const listed = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        return yield* repo.list()
      }),
    )

    expect(listed.map((partner) => partner.name)).toEqual(["Newer", "Older"])
    expect(listed[0]?.enabled).toBe(false)
  })

  it("refuses to resurrect a partner that was soft-deleted after the caller read it", async () => {
    const partner = await savePartner()
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        yield* repo.softDelete(PARTNER_A)
      }),
    )

    // The stale entity still carries `deletedAt: null`, which is exactly what a blind
    // update-by-id would write back — re-arming the partner's signing secret.
    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        yield* repo.save({ ...partner, name: "Renamed" })
      }),
    )

    expect(Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error._tag : undefined).toBe(
      "NotFoundError",
    )
    const [row] = await pg.db.select().from(partners).where(eq(partners.id, PARTNER_A))
    expect(row?.deletedAt).not.toBeNull()
    expect(row?.name).toBe("Longitude")
  })

  it("refuses a secret rotation onto a soft-deleted partner", async () => {
    const partner = await savePartner()
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        yield* repo.softDelete(PARTNER_A)
      }),
    )

    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* PartnerRepository
        yield* repo.save(partner, { hmacSecret: "rotated-onto-a-corpse" })
      }),
    )

    expect(Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error._tag : undefined).toBe(
      "NotFoundError",
    )
    const [row] = await pg.db.select().from(partners).where(eq(partners.id, PARTNER_A))
    expect(row?.deletedAt).not.toBeNull()
  })
})
