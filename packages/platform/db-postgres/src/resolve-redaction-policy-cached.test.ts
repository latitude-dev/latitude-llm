import { CacheError, CacheStore, generateId, OrganizationId } from "@domain/shared"
import { organizations } from "@platform/db-postgres/schema/better-auth"
import { withTracing } from "@repo/observability"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SettingsReaderLive } from "./repositories/settings-reader-repository.ts"
import {
  invalidateOrganizationRedactionCache,
  resolveOrganizationRedactionCached,
} from "./resolve-redaction-policy-cached.ts"
import { setupTestPostgres } from "./test/in-memory-postgres.ts"
import { withPostgres } from "./with-postgres.ts"

const pg = setupTestPostgres()

interface CacheProbe {
  readonly store: Map<string, string>
  gets: number
  sets: number
}

const cacheLayer = (probe: CacheProbe) =>
  Layer.succeed(CacheStore, {
    get: (key: string) =>
      Effect.sync(() => {
        probe.gets += 1
        return probe.store.get(key) ?? null
      }),
    set: (key: string, value: string) =>
      Effect.sync(() => {
        probe.sets += 1
        probe.store.set(key, value)
      }),
    delete: (key: string) =>
      Effect.sync(() => {
        probe.store.delete(key)
      }),
  })

const failingCacheLayer = Layer.succeed(CacheStore, {
  get: () => Effect.fail(new CacheError({ message: "redis down" })),
  set: () => Effect.fail(new CacheError({ message: "redis down" })),
  delete: () => Effect.void,
})

const seedOrg = async (settings?: Record<string, unknown>) => {
  const organizationId = generateId()
  await pg.db.insert(organizations).values({
    id: organizationId,
    name: "Redaction Org",
    slug: `redaction-${organizationId}`,
    ...(settings ? { settings: settings as never } : {}),
  })

  return organizationId
}

const run = (organizationId: string, cache: Layer.Layer<CacheStore>) =>
  Effect.runPromise(
    resolveOrganizationRedactionCached(OrganizationId(organizationId)).pipe(
      withPostgres(SettingsReaderLive, pg.appPostgresClient, OrganizationId(organizationId)),
      Effect.provide(cache),
      withTracing,
    ),
  )

describe("resolveOrganizationRedactionCached", () => {
  it("returns null when the organization has no redaction policy", async () => {
    const organizationId = await seedOrg()
    const probe: CacheProbe = { store: new Map(), gets: 0, sets: 0 }

    expect(await run(organizationId, cacheLayer(probe))).toBeNull()
  })

  it("returns the stored organization policy", async () => {
    const organizationId = await seedOrg({ redaction: { mode: "enforce", entities: ["email"], locked: true } })
    const probe: CacheProbe = { store: new Map(), gets: 0, sets: 0 }

    expect(await run(organizationId, cacheLayer(probe))).toEqual({
      mode: "enforce",
      entities: ["email"],
      locked: true,
    })
  })

  it("serves the second read from cache without querying again", async () => {
    const organizationId = await seedOrg({ redaction: { mode: "enforce" } })
    const probe: CacheProbe = { store: new Map(), gets: 0, sets: 0 }

    const first = await run(organizationId, cacheLayer(probe))

    await pg.db
      .update(organizations)
      .set({ settings: { redaction: { mode: "off" } } as never })
      .where(eq(organizations.id, organizationId))

    const second = await run(organizationId, cacheLayer(probe))

    expect(first).toEqual({ mode: "enforce" })
    expect(second).toEqual({ mode: "enforce" })
    expect(probe.sets).toBe(1)
  })

  /**
   * Almost every org has no policy. If a cached `null` were indistinguishable from
   * a miss, the cache would never serve that case and every OTLP request would
   * query Postgres, which is the whole reason this wrapper exists.
   */
  it("caches the absence of a policy rather than re-querying for it", async () => {
    const organizationId = await seedOrg()
    const probe: CacheProbe = { store: new Map(), gets: 0, sets: 0 }

    await run(organizationId, cacheLayer(probe))

    await pg.db
      .update(organizations)
      .set({ settings: { redaction: { mode: "enforce" } } as never })
      .where(eq(organizations.id, organizationId))

    expect(await run(organizationId, cacheLayer(probe))).toBeNull()
    expect(probe.sets).toBe(1)
  })

  it("uses an organization-prefixed cache key", async () => {
    const organizationId = await seedOrg({ redaction: { mode: "enforce" } })
    const probe: CacheProbe = { store: new Map(), gets: 0, sets: 0 }

    await run(organizationId, cacheLayer(probe))

    expect([...probe.store.keys()]).toEqual([`org:${organizationId}:settings:redaction`])
  })

  it("re-reads after invalidation", async () => {
    const organizationId = await seedOrg({ redaction: { mode: "enforce" } })
    const probe: CacheProbe = { store: new Map(), gets: 0, sets: 0 }
    const cache = cacheLayer(probe)

    await run(organizationId, cache)

    await pg.db
      .update(organizations)
      .set({ settings: { redaction: { mode: "enforce" } } as never })
      .where(eq(organizations.id, organizationId))

    await Effect.runPromise(
      invalidateOrganizationRedactionCache(OrganizationId(organizationId)).pipe(Effect.provide(cache), withTracing),
    )

    expect(await run(organizationId, cache)).toEqual({ mode: "enforce" })
  })

  it("falls back to the database when the cache is unavailable", async () => {
    const organizationId = await seedOrg({ redaction: { mode: "enforce" } })

    expect(await run(organizationId, failingCacheLayer)).toEqual({ mode: "enforce" })
  })

  it("re-reads rather than trusting a corrupt cache entry", async () => {
    const organizationId = await seedOrg({ redaction: { mode: "enforce" } })
    const probe: CacheProbe = { store: new Map(), gets: 0, sets: 0 }
    probe.store.set(`org:${organizationId}:settings:redaction`, "{not json")

    expect(await run(organizationId, cacheLayer(probe))).toEqual({ mode: "enforce" })
  })

  it("re-reads rather than trusting a schema-invalid cache entry", async () => {
    const organizationId = await seedOrg({ redaction: { mode: "enforce" } })
    const probe: CacheProbe = { store: new Map(), gets: 0, sets: 0 }
    probe.store.set(`org:${organizationId}:settings:redaction`, JSON.stringify({ redaction: { mode: "bogus" } }))

    expect(await run(organizationId, cacheLayer(probe))).toEqual({ mode: "enforce" })
  })
})
