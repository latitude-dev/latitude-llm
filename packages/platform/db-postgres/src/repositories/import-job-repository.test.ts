import { createImportJob, type ImportJob, ImportJobRepository } from "@domain/imports"
import { ConflictError, ImportJobId, OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Cause, Effect, Exit } from "effect"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { organizations } from "../schema/better-auth.ts"
import { importJobs } from "../schema/import-jobs.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { ImportJobRepositoryLive, redactedImportJob } from "./import-job-repository.ts"

// Same 32-byte hex key as .env.test for parity, set on process.env so the
// repository's getEncryptionKey() resolves without an ambient .env load.
beforeAll(() => {
  process.env.LAT_MASTER_ENCRYPTION_KEY =
    process.env.LAT_MASTER_ENCRYPTION_KEY ?? "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"
})

const ORG_A = OrganizationId("a".repeat(24))
const ORG_B = OrganizationId("b".repeat(24))
const PROJECT_A = ProjectId("p".repeat(24))
const PROJECT_B = ProjectId("q".repeat(24))

const SECRET_KEY = "sk-lf-do-not-persist-in-plaintext"

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, ImportJobRepository | SqlClient>, org: OrganizationId = ORG_A) =>
  Effect.runPromise(effect.pipe(withPostgres(ImportJobRepositoryLive, pg.adminPostgresClient, org)))

const makeJob = (overrides: Partial<ImportJob> = {}): ImportJob => ({
  ...createImportJob({
    organizationId: ORG_A,
    projectId: PROJECT_A,
    source: "langfuse",
    config: {
      sourceProjectId: "lf-project",
      sourceProjectName: "LF Project",
      sourceRegion: "eu",
      sourceBaseUrl: "https://cloud.langfuse.com",
      rangeFrom: new Date("2026-01-01T00:00:00.000Z"),
      rangeTo: new Date("2026-04-01T00:00:00.000Z"),
      maxTraces: 250_000,
      sourcePageSize: 1_000,
    },
    credentials: {
      kind: "langfuse",
      region: "eu",
      publicKey: "pk-lf-public",
      secretKey: SECRET_KEY,
    },
  }),
  ...overrides,
})

const save = (job: ImportJob, org: OrganizationId = ORG_A) =>
  runWithLive(
    Effect.gen(function* () {
      const repo = yield* ImportJobRepository
      yield* repo.save(job)
    }),
    org,
  )

const findById = (id: ImportJob["id"], org: OrganizationId = ORG_A) =>
  runWithLive(
    Effect.gen(function* () {
      const repo = yield* ImportJobRepository
      return yield* repo.findById(id)
    }),
    org,
  )

const seedOrganizations = async () => {
  await pg.db.insert(organizations).values([
    { id: ORG_A, name: "Org A", slug: "org-a" },
    { id: ORG_B, name: "Org B", slug: "org-b" },
  ])
}

afterEach(async () => {
  await pg.db.delete(importJobs)
  await pg.db.delete(organizations)
})

describe("ImportJobRepositoryLive", () => {
  describe("credential handling", () => {
    it("encrypts credentials on write and decrypts them back on read", async () => {
      await seedOrganizations()
      const job = makeJob()

      await save(job)

      const [rawRow] = await pg.db.select().from(importJobs)
      expect(rawRow?.credentials).not.toContain(SECRET_KEY)
      expect(rawRow?.credentials).not.toContain("pk-lf-public")
      expect(rawRow?.credentials).not.toBe(JSON.stringify(job.credentials))
      expect(rawRow?.credentials).toContain(":") // iv:authTag:ciphertext

      const fetched = await findById(job.id)
      expect(fetched?.credentials).toEqual(job.credentials)
    })

    it("stores a null credential without ciphertext once the job is scrubbed", async () => {
      await seedOrganizations()
      const job = makeJob()
      await save(job)

      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          yield* repo.updateStatus(job.id, "succeeded", { credentials: null, finishedAt: new Date() })
        }),
      )

      const [rawRow] = await pg.db.select().from(importJobs)
      expect(rawRow?.credentials).toBeNull()
      expect((await findById(job.id))?.credentials).toBeNull()
    })

    it("returns the persisted row from updateStatus, so callers report what was written", async () => {
      await seedOrganizations()
      const job = makeJob()
      await save(job)
      const finishedAt = new Date("2026-05-01T00:00:00Z")

      const updated = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          return yield* repo.updateStatus(job.id, "capped", { credentials: null, finishedAt, error: "hit the ceiling" })
        }),
      )

      expect(updated).toMatchObject({ id: job.id, status: "capped", finishedAt, error: "hit the ceiling" })
      expect(updated?.credentials).toBeNull()
    })

    it("reports a missing job as null rather than a silent no-op", async () => {
      await seedOrganizations()

      const updated = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          return yield* repo.updateStatus(ImportJobId("z".repeat(24)), "failed")
        }),
      )

      expect(updated).toBeNull()
    })

    it("redacts credentials before the job leaves the server", async () => {
      const job = makeJob()

      const redacted = redactedImportJob(job)

      expect(redacted.credentials).toBeNull()
      expect(JSON.stringify(redacted)).not.toContain(SECRET_KEY)
      expect(redacted.id).toBe(job.id)
      expect(redacted.config).toEqual(job.config)
    })
  })

  describe("round-tripping", () => {
    it("preserves config, stats, cursor and run history through a save/read cycle", async () => {
      await seedOrganizations()
      const windowEnd = new Date("2026-03-20T00:00:00.000Z")
      const cursor = { windowEnd, windowMs: 86_400_000, source: { page: 4, extra: "carried" } }
      const run = {
        status: "succeeded" as const,
        cursor: { start: { ...cursor, source: { page: 3 } }, end: cursor },
        stats: { recordsFetched: 10, tracesImported: 2, spansImported: 9, spansSkipped: 1 },
        error: null,
        startedAt: new Date("2026-03-01T00:00:00.000Z"),
        finishedAt: new Date("2026-03-01T00:00:04.000Z"),
      }
      const job = makeJob({
        cursor,
        stats: { recordsFetched: 40, tracesImported: 8, spansImported: 38, spansSkipped: 2 },
        runs: [run],
      })

      await save(job)
      const fetched = await findById(job.id)

      expect(fetched?.config.rangeFrom).toEqual(job.config.rangeFrom)
      expect(fetched?.config.rangeTo).toEqual(job.config.rangeTo)
      expect(fetched?.config.maxTraces).toBe(250_000)
      expect(fetched?.config.sourcePageSize).toBe(1_000)
      // The cursor carries a Date through jsonb, which hands it back as an ISO string.
      expect(fetched?.cursor).toEqual(cursor)
      expect(fetched?.stats).toEqual(job.stats)
      // The ring buffer is jsonb, so its dates have to survive a JSON round-trip.
      expect(fetched?.runs).toEqual([run])
    })

    it("upserts by id, advancing the cursor and stats", async () => {
      await seedOrganizations()
      const job = makeJob()
      await save(job)

      await save({
        ...job,
        status: "running",
        cursor: { windowEnd: new Date("2026-03-10T00:00:00.000Z"), windowMs: 86_400_000, source: { page: 9 } },
        stats: { ...job.stats, spansImported: 90, recordsFetched: 90 },
      })

      const rows = await pg.db.select().from(importJobs)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.status).toBe("running")
      expect(rows[0]?.cursor).toMatchObject({ source: { page: 9 } })
      expect(rows[0]?.stats).toMatchObject({ spansImported: 90 })
    })

    it("returns null for an unknown id", async () => {
      await seedOrganizations()

      expect(await findById(ImportJobId("z".repeat(24)))).toBeNull()
    })
  })

  describe("one active import per org", () => {
    // `created` included: the slot is claimed by the insert, so a concurrent create fails on
    // `save` — where the violation maps to a typed ConflictError — not on the flip to `queued`.
    it.each([
      ["created" as const],
      ["queued" as const],
      ["running" as const],
    ])("rejects a second %s import as a conflict", async (status) => {
      await seedOrganizations()
      await save(makeJob({ status }))

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          yield* repo.save(makeJob({ status, projectId: PROJECT_B }))
        }).pipe(withPostgres(ImportJobRepositoryLive, pg.adminPostgresClient, ORG_A)),
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const failReason = exit.cause.reasons.find(Cause.isFailReason)
        expect(failReason?.error).toBeInstanceOf(ConflictError)
        expect((failReason?.error as ConflictError).field).toBe("organizationId")
      }
    })

    it("keeps the slot across the created-to-queued flip, so enqueueing does not free it", async () => {
      await seedOrganizations()
      const job = makeJob({ status: "created" })
      await save(job)

      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          return yield* repo.updateStatus(job.id, "queued")
        }),
      )

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          yield* repo.save(makeJob({ status: "created", projectId: PROJECT_B }))
        }).pipe(withPostgres(ImportJobRepositoryLive, pg.adminPostgresClient, ORG_A)),
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })

    it("allows a new import once the previous one is terminal", async () => {
      await seedOrganizations()
      await save(makeJob({ status: "succeeded" }))
      await save(makeJob({ status: "capped" }))

      await save(makeJob({ status: "queued" }))

      expect(await pg.db.select().from(importJobs)).toHaveLength(3)
    })

    it("does not let one org's active import block another's", async () => {
      await seedOrganizations()
      await save(makeJob({ status: "running" }))

      await save(makeJob({ organizationId: ORG_B, projectId: PROJECT_B, status: "running" }), ORG_B)

      expect(await pg.db.select().from(importJobs)).toHaveLength(2)
    })

    it("finds the org's active import and ignores terminal ones", async () => {
      await seedOrganizations()
      await save(makeJob({ status: "succeeded" }))
      const active = makeJob({ status: "running", projectId: PROJECT_B })
      await save(active)

      const found = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          return yield* repo.findActive()
        }),
      )

      expect(found?.id).toBe(active.id)
    })

    it("reports no active import when every job is terminal", async () => {
      await seedOrganizations()
      await save(makeJob({ status: "failed" }))

      const found = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          return yield* repo.findActive()
        }),
      )

      expect(found).toBeNull()
    })

    it("scopes the active lookup to the calling org", async () => {
      await seedOrganizations()
      await save(makeJob({ status: "running" }))

      const found = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          return yield* repo.findActive()
        }),
        ORG_B,
      )

      expect(found).toBeNull()
    })
  })

  describe("organization scoping", () => {
    it("does not return another org's job by id", async () => {
      await seedOrganizations()
      const job = makeJob()
      await save(job)

      expect(await findById(job.id, ORG_B)).toBeNull()
    })

    it("lists only the requested project's jobs, newest first", async () => {
      await seedOrganizations()
      const older = makeJob({ createdAt: new Date("2026-01-01T00:00:00.000Z"), status: "succeeded" })
      const newer = makeJob({ createdAt: new Date("2026-02-01T00:00:00.000Z"), status: "failed" })
      const otherProject = makeJob({ projectId: PROJECT_B, status: "succeeded" })
      await save(older)
      await save(newer)
      await save(otherProject)

      const listed = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          return yield* repo.listByProjectId(PROJECT_A)
        }),
      )

      expect(listed.map((j) => j.id)).toEqual([newer.id, older.id])
    })
  })

  describe("markFailedIfActive", () => {
    // `created` included so a job that never reached the queue can still be failed rather
    // than holding the org's only slot forever.
    it.each([
      ["created" as const],
      ["queued" as const],
      ["running" as const],
    ])("fails a %s job and scrubs credentials", async (status) => {
      await seedOrganizations()
      const job = makeJob({ status })
      await save(job)
      const finishedAt = new Date("2026-05-01T00:00:00.000Z")

      const marked = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          return yield* repo.markFailedIfActive(job.id, { error: "retries exhausted", finishedAt })
        }),
      )

      expect(marked).toBe(true)
      const stored = await findById(job.id)
      expect(stored?.status).toBe("failed")
      expect(stored?.error).toBe("retries exhausted")
      expect(stored?.credentials).toBeNull()
    })

    it.each([
      ["succeeded" as const],
      ["capped" as const],
      ["cancelled" as const],
      ["failed" as const],
    ])("refuses to overwrite a %s job", async (status) => {
      await seedOrganizations()
      const job = makeJob({ status, credentials: null })
      await save(job)

      const marked = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          return yield* repo.markFailedIfActive(job.id, { error: "stale", finishedAt: new Date() })
        }),
      )

      expect(marked).toBe(false)
      expect((await findById(job.id))?.status).toBe(status)
    })

    it("will not fail another org's active job", async () => {
      await seedOrganizations()
      const job = makeJob({ status: "running" })
      await save(job)

      const marked = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          return yield* repo.markFailedIfActive(job.id, { error: "x", finishedAt: new Date() })
        }),
        ORG_B,
      )

      expect(marked).toBe(false)
      expect((await findById(job.id))?.status).toBe("running")
    })
  })

  describe("deleteByProjectId", () => {
    it("removes the project's jobs and leaves other projects alone", async () => {
      await seedOrganizations()
      await save(makeJob({ status: "succeeded" }))
      const other = makeJob({ projectId: PROJECT_B, status: "succeeded" })
      await save(other)

      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* ImportJobRepository
          yield* repo.deleteByProjectId(PROJECT_A)
        }),
      )

      const remaining = await pg.db.select().from(importJobs)
      expect(remaining.map((r) => r.id)).toEqual([other.id])
    })
  })
})
