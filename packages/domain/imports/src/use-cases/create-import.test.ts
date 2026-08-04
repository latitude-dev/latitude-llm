import { FREE_PLAN_CONFIG, PRO_PLAN_CONFIG } from "@domain/billing"
import { ProjectId } from "@domain/shared"
import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import {
  IMPORT_HARD_MAX_TRACES,
  IMPORT_MAX_LOOKBACK_DAYS,
  IMPORT_SOURCE_PAGE_SIZE,
  IMPORT_SOURCE_PAGE_SIZE_MAX,
} from "../constants.ts"
import type { CreateImportInput } from "../entities/import-job.ts"
import { stubImportPlan } from "../testing/fakes.ts"
import {
  importHarness,
  STUB_IMPORT_ACTOR_ID,
  STUB_IMPORT_CREDENTIALS,
  STUB_IMPORT_MAX_TRACES,
  STUB_IMPORT_ORGANIZATION_ID,
  STUB_IMPORT_PROJECT_ID,
  STUB_IMPORT_RANGE_TO,
  stubEnterprisePlan,
  stubFreePlan,
  stubImportConfig,
  stubImportDays,
  stubImportJob,
} from "../testing/harness.ts"
import { createImportUseCase } from "./create-import.ts"

const input = (
  overrides: {
    readonly rangeFrom?: Date
    readonly rangeTo?: Date
    readonly maxTraces?: number
    readonly sourcePageSize?: number
    readonly sessionMetadataKey?: string
    readonly plan?: CreateImportInput["plan"]
  } = {},
): CreateImportInput => {
  const rangeTo = overrides.rangeTo ?? STUB_IMPORT_RANGE_TO
  return {
    organizationId: STUB_IMPORT_ORGANIZATION_ID,
    projectId: STUB_IMPORT_PROJECT_ID,
    source: "langfuse",
    config: stubImportConfig({
      rangeTo,
      rangeFrom: overrides.rangeFrom ?? new Date(rangeTo.getTime() - stubImportDays(90)),
      ...(overrides.maxTraces !== undefined ? { maxTraces: overrides.maxTraces } : {}),
      ...(overrides.sourcePageSize !== undefined ? { sourcePageSize: overrides.sourcePageSize } : {}),
      ...(overrides.sessionMetadataKey !== undefined ? { sessionMetadataKey: overrides.sessionMetadataKey } : {}),
    }),
    credentials: STUB_IMPORT_CREDENTIALS,
    plan: overrides.plan ?? stubEnterprisePlan(),
    createdByUserId: STUB_IMPORT_ACTOR_ID,
  }
}

const causeOf = (exit: Exit.Exit<unknown, unknown>) => JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)

describe("createImportUseCase", () => {
  it("creates the job in the pre-flight state, with the range and page size snapshotted", async () => {
    const h = importHarness()

    const job = await Effect.runPromise(createImportUseCase(input()).pipe(Effect.provide(h.layer)))

    expect(job.status).toBe("created")
    expect(job.cursor).toBeNull()
    expect(job.startedAt).toBeNull()
    expect(job.finishedAt).toBeNull()
    expect(job.cancelledAt).toBeNull()
    expect(job.error).toBeNull()
    expect(job.config.maxTraces).toBe(STUB_IMPORT_MAX_TRACES)
    expect(job.config.sourcePageSize).toBe(IMPORT_SOURCE_PAGE_SIZE)
    expect(job.runs).toEqual([])
    expect(job.stats).toEqual({ recordsFetched: 0, tracesImported: 0, spansImported: 0, spansSkipped: 0 })
  })

  it("persists the job it returns", async () => {
    const h = importHarness()

    const job = await Effect.runPromise(createImportUseCase(input()).pipe(Effect.provide(h.layer)))

    expect(h.stored.get(job.id)).toEqual(job)
  })

  // The worker authenticates with these on the first page; `finishImport` scrubs them later.
  it("keeps the credentials on the created job", async () => {
    const h = importHarness()

    const job = await Effect.runPromise(createImportUseCase(input()).pipe(Effect.provide(h.layer)))

    expect(job.credentials).toEqual(STUB_IMPORT_CREDENTIALS)
  })

  it("carries the session metadata key into the snapshot", async () => {
    const h = importHarness()

    const job = await Effect.runPromise(
      createImportUseCase(input({ sessionMetadataKey: "conversation_id" })).pipe(Effect.provide(h.layer)),
    )

    expect(job.config.sessionMetadataKey).toBe("conversation_id")
  })

  describe("ceilings", () => {
    it("clamps a requested max above the hard cap and snapshots the clamped value", async () => {
      const h = importHarness()

      const job = await Effect.runPromise(
        createImportUseCase(input({ maxTraces: IMPORT_HARD_MAX_TRACES })).pipe(Effect.provide(h.layer)),
      )

      expect(job.config.maxTraces).toBe(IMPORT_HARD_MAX_TRACES)
    })

    it("clamps a page size above the source ceiling", async () => {
      const h = importHarness()

      const job = await Effect.runPromise(
        createImportUseCase(input({ sourcePageSize: IMPORT_SOURCE_PAGE_SIZE_MAX })).pipe(Effect.provide(h.layer)),
      )

      expect(job.config.sourcePageSize).toBe(IMPORT_SOURCE_PAGE_SIZE_MAX)
    })

    // Plan usage does not narrow what may be asked for: the job meters trace by trace and pauses
    // when the org runs out, so a nearly-spent period still accepts the ceiling the user chose.
    it("keeps the requested trace ceiling on a nearly spent period", async () => {
      const h = importHarness({
        plan: stubFreePlan(),
        consumedCredits: FREE_PLAN_CONFIG.includedCredits - 300,
      })

      const job = await Effect.runPromise(
        createImportUseCase(input({ plan: h.plan, rangeFrom: new Date("2026-03-02T00:00:00Z") })).pipe(
          Effect.provide(h.layer),
        ),
      )

      expect(job.config.maxTraces).toBe(STUB_IMPORT_MAX_TRACES)
    })

    it("refuses to start an import that would cap on its first page", async () => {
      const h = importHarness({ plan: stubFreePlan(), consumedCredits: FREE_PLAN_CONFIG.includedCredits })

      const exit = await Effect.runPromiseExit(
        createImportUseCase(input({ plan: h.plan, rangeFrom: new Date("2026-03-02T00:00:00Z") })).pipe(
          Effect.provide(h.layer),
        ),
      )

      expect(causeOf(exit)).toContain("ImportUsageExhaustedError")
      expect(h.stored.size).toBe(0)
    })

    it("rejects a range reaching past the plan's span retention", async () => {
      const h = importHarness()

      const exit = await Effect.runPromiseExit(
        createImportUseCase(
          input({
            plan: stubImportPlan(STUB_IMPORT_ORGANIZATION_ID, {
              plan: { retentionDays: PRO_PLAN_CONFIG.retentionDays },
            }),
            rangeFrom: new Date(STUB_IMPORT_RANGE_TO.getTime() - stubImportDays(120)),
          }),
        ).pipe(Effect.provide(h.layer)),
      )

      // Importing older history would bill for spans ClickHouse then deletes.
      expect(causeOf(exit)).toContain("Lookback cannot exceed 90 days, the span retention on the pro plan")
    })
  })

  describe("range validation", () => {
    it("rejects a range longer than the max lookback as a typed failure", async () => {
      const h = importHarness()

      const exit = await Effect.runPromiseExit(
        createImportUseCase(input({ rangeFrom: new Date(STUB_IMPORT_RANGE_TO.getTime() - stubImportDays(400)) })).pipe(
          Effect.provide(h.layer),
        ),
      )

      expect(causeOf(exit)).toContain("ImportRangeInvalidError")
      expect(causeOf(exit)).toContain("Lookback cannot exceed 365 days")
      expect(h.stored.size).toBe(0)
    })

    it.each([
      ["a minutes-wide range", 60_000],
      ["an empty range", 0],
      ["a reversed range", -stubImportDays(5)],
    ])("rejects %s as a typed failure", async (_label, elapsedMs) => {
      const h = importHarness()

      const exit = await Effect.runPromiseExit(
        createImportUseCase(input({ rangeFrom: new Date(STUB_IMPORT_RANGE_TO.getTime() - elapsedMs) })).pipe(
          Effect.provide(h.layer),
        ),
      )

      expect(causeOf(exit)).toContain("Lookback must be at least 1 day")
      expect(h.stored.size).toBe(0)
    })

    it.each([
      ["the minimum", 1],
      ["the max", IMPORT_MAX_LOOKBACK_DAYS],
    ])("accepts a range exactly at %s lookback", async (_label, days) => {
      const h = importHarness()

      const job = await Effect.runPromise(
        createImportUseCase(input({ rangeFrom: new Date(STUB_IMPORT_RANGE_TO.getTime() - stubImportDays(days)) })).pipe(
          Effect.provide(h.layer),
        ),
      )

      expect(job.status).toBe("created")
    })

    it("surfaces range errors as failures rather than defects", async () => {
      const h = importHarness()

      const exit = await Effect.runPromiseExit(
        createImportUseCase(input({ rangeFrom: new Date(STUB_IMPORT_RANGE_TO.getTime() - stubImportDays(400)) })).pipe(
          Effect.provide(h.layer),
        ),
      )

      // A defect here would reach the web layer as an opaque 500 instead of a message
      // the wizard can show against the range field.
      expect(causeOf(exit)).not.toContain("Die")
      expect(causeOf(exit)).toContain("Fail")
    })
  })

  describe("one import per org", () => {
    it.each([
      ["created" as const],
      ["queued" as const],
      ["running" as const],
    ])("refuses to create a second import while one is %s", async (status) => {
      const active = stubImportJob({ status })
      const h = importHarness({ seed: [active] })

      const exit = await Effect.runPromiseExit(createImportUseCase(input()).pipe(Effect.provide(h.layer)))

      expect(causeOf(exit)).toContain("ActiveImportConflictError")
      expect(causeOf(exit)).toContain(active.id)
      expect(h.stored.size).toBe(1)
    })

    // The limit is org-wide but the imports page is project-scoped, so the conflict has to say which
    // project holds the blocking job: the page the user is looking at may list no import at all.
    it("names the project and source project the blocking import belongs to", async () => {
      const otherProject = ProjectId("q".repeat(24))
      const active = stubImportJob({
        status: "running",
        projectId: otherProject,
        config: stubImportConfig({ sourceProjectName: "Checkout Agent" }),
      })
      const h = importHarness({ seed: [active] })

      const exit = await Effect.runPromiseExit(createImportUseCase(input()).pipe(Effect.provide(h.layer)))

      expect(causeOf(exit)).toContain(otherProject)
      expect(causeOf(exit)).toContain("Checkout Agent")
    })

    it.each([
      ["succeeded" as const],
      ["capped" as const],
      ["cancelled" as const],
      ["failed" as const],
    ])("allows a new import once the previous one is %s", async (status) => {
      const h = importHarness({ seed: [stubImportJob({ status })] })

      const job = await Effect.runPromise(createImportUseCase(input()).pipe(Effect.provide(h.layer)))

      expect(job.status).toBe("created")
      expect(h.stored.size).toBe(2)
    })
  })

  describe("ImportStarted", () => {
    it("emits the actor and the confirmed configuration", async () => {
      const h = importHarness()

      const job = await Effect.runPromise(createImportUseCase(input()).pipe(Effect.provide(h.layer)))

      expect(h.written).toHaveLength(1)
      expect(h.written[0]).toMatchObject({
        eventName: "ImportStarted",
        aggregateType: "import-job",
        aggregateId: job.id,
        organizationId: STUB_IMPORT_ORGANIZATION_ID,
        payload: {
          organizationId: STUB_IMPORT_ORGANIZATION_ID,
          actorUserId: STUB_IMPORT_ACTOR_ID,
          projectId: STUB_IMPORT_PROJECT_ID,
          importJobId: job.id,
          source: "langfuse",
          maxTraces: STUB_IMPORT_MAX_TRACES,
          rangeDays: 90,
        },
      })
    })

    it("rounds the range to whole days", async () => {
      const h = importHarness()

      await Effect.runPromise(
        createImportUseCase(
          input({ rangeFrom: new Date(STUB_IMPORT_RANGE_TO.getTime() - stubImportDays(30) - 60_000) }),
        ).pipe(Effect.provide(h.layer)),
      )

      expect(h.written[0]).toMatchObject({ payload: { rangeDays: 30 } })
    })

    it("emits no event when the range is rejected", async () => {
      const h = importHarness()

      await Effect.runPromiseExit(
        createImportUseCase(input({ rangeFrom: new Date(STUB_IMPORT_RANGE_TO.getTime() - stubImportDays(400)) })).pipe(
          Effect.provide(h.layer),
        ),
      )

      expect(h.written).toEqual([])
    })

    it("emits no event when another import is already active", async () => {
      const h = importHarness({ seed: [stubImportJob({ status: "running" })] })

      await Effect.runPromiseExit(createImportUseCase(input()).pipe(Effect.provide(h.layer)))

      expect(h.written).toEqual([])
    })

    it("emits no event when the org has no usage left", async () => {
      const h = importHarness({ plan: stubFreePlan(), consumedCredits: FREE_PLAN_CONFIG.includedCredits })

      await Effect.runPromiseExit(
        createImportUseCase(input({ plan: h.plan, rangeFrom: new Date("2026-03-02T00:00:00Z") })).pipe(
          Effect.provide(h.layer),
        ),
      )

      expect(h.written).toEqual([])
    })
  })
})
