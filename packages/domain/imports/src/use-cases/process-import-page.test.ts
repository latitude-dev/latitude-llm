import { BillingUsagePeriodRepository, FREE_PLAN_CONFIG } from "@domain/billing"
import { createFakeBillingUsagePeriodRepository, seedBillingUsagePeriod } from "@domain/billing/testing"
import type { DomainEvent } from "@domain/events"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import {
  ChSqlClient,
  generateId,
  ImportJobId,
  OrganizationId,
  ProjectId,
  type RedactionPolicy,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import type { SpanDetail } from "@domain/spans"
import { SpanRepository } from "@domain/spans"
import { createFakeSpanRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  IMPORT_MAX_RATE_LIMIT_WAITS,
  IMPORT_PAGE_TIMEOUT_MS,
  IMPORT_RUN_HISTORY_LIMIT,
  IMPORT_WINDOW_BASE_MS,
  sourceRequestIntervalMs,
} from "../constants.ts"
import type { ImportJob } from "../entities/import-job.ts"
import { createImportJob } from "../entities/import-job.ts"
import { ImportSourceError } from "../errors.ts"
import { ImportJobRepository } from "../ports/import-job-repository.ts"
import { ImportSourceAdapters } from "../ports/import-source-adapter.ts"
import {
  createFakeImportAdapterRegistry,
  FAKE_ROWS_LATEST,
  type FakeAdapterOptions,
  type FakeImportRow,
  fakeImportHexId,
  fakeImportRows,
} from "../testing/fake-adapter.ts"
import { createFakeImportJobRepository, stubImportPlan, stubSpanDetail } from "../testing/fakes.ts"
import { importHarness, stubImportJob } from "../testing/harness.ts"
import { processImportPageUseCase, recordImportFinalFailureUseCase } from "./process-import-page.ts"

// One day wide, so it is exactly one window of the engine's descending walk and the
// fixture rows (which run backwards from midday) all land inside it.
const RANGE_TO = new Date("2026-01-21T00:00:00Z")
const RANGE_FROM = new Date("2026-01-20T00:00:00Z")

const BASE_CONFIG = {
  sourceProjectId: "project-1",
  sourceProjectName: "Project 1",
  sourceRegion: "eu",
  sourceBaseUrl: "https://cloud.langfuse.com",
  rangeFrom: RANGE_FROM,
  rangeTo: RANGE_TO,
  maxTraces: 1_000,
  sourcePageSize: 10,
}

const withMaxTraces = (maxTraces: number) => ({ ...BASE_CONFIG, maxTraces })

/** The cursor the engine holds while still paging inside the first window. */
const insideFirstWindow = (source: Record<string, unknown> | null) => ({
  windowEnd: RANGE_TO,
  windowMs: IMPORT_WINDOW_BASE_MS,
  source,
})

const makeJob = (overrides: Partial<ImportJob> = {}): ImportJob => ({
  ...createImportJob({
    id: ImportJobId(generateId()),
    organizationId: OrganizationId(generateId()),
    projectId: ProjectId(generateId()),
    source: "langfuse",
    config: BASE_CONFIG,
    credentials: {
      kind: "langfuse",
      region: "eu",
      publicKey: "pk-test",
      secretKey: "sk-test",
    },
    status: "running",
  }),
  ...overrides,
})

interface PublishedPage {
  readonly payload: {
    readonly organizationId: string
    readonly projectId: string
    readonly importJobId: string
    readonly rateLimitWaits?: number
  }
  readonly delayMs: number | undefined
}

const harness = (
  job: ImportJob,
  adapterOptions: FakeAdapterOptions = {},
  deps: {
    readonly pageTimeoutMs?: number
    readonly isSandbox?: boolean
    readonly plan?: ReturnType<typeof stubImportPlan>
    readonly consumedCredits?: number
    readonly redactionPolicy?: RedactionPolicy
    readonly seedSpans?: readonly SpanDetail[]
  } = {},
) => {
  const jobs = createFakeImportJobRepository()
  const spans = createFakeSpanRepository()
  const written: OutboxWriteEvent[] = []
  const events: DomainEvent[] = []
  const { registry, fetchPageCalls } = createFakeImportAdapterRegistry(adapterOptions)
  const published: PublishedPage[] = []
  const plan = deps.plan ?? stubImportPlan(job.organizationId)
  const periods = createFakeBillingUsagePeriodRepository()

  jobs.jobs.set(job.id, job)

  if (deps.seedSpans !== undefined) {
    for (const span of deps.seedSpans) {
      spans.inserted.push([span])
    }
  }

  if (deps.consumedCredits !== undefined) {
    Effect.runSync(
      periods.repository
        .upsert(
          seedBillingUsagePeriod({
            organizationId: job.organizationId,
            planSlug: plan.plan.slug,
            periodStart: plan.periodStart,
            periodEnd: plan.periodEnd,
            includedCredits: plan.plan.includedCredits,
            consumedCredits: deps.consumedCredits,
          }),
        )
        .pipe(Effect.provideService(SqlClient, createFakeSqlClient({ organizationId: job.organizationId }))),
    )
  }

  const processPage = processImportPageUseCase({
    publishNextPage: (payload, options) =>
      Effect.sync(() => {
        published.push({ payload, delayMs: options?.delayMs })
      }),
    eventsPublisher: {
      publish: (event) =>
        Effect.sync(() => {
          events.push(event)
        }),
    },
    ...(deps.pageTimeoutMs !== undefined ? { pageTimeoutMs: deps.pageTimeoutMs } : {}),
  })

  const layer = Layer.mergeAll(
    Layer.succeed(ImportJobRepository, jobs.repository),
    Layer.succeed(ImportSourceAdapters, registry),
    Layer.succeed(SpanRepository, spans.repository),
    Layer.succeed(BillingUsagePeriodRepository, periods.repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: job.organizationId })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: job.organizationId })),
    Layer.succeed(OutboxEventWriter, {
      write: (event) => {
        written.push(event)
        return Effect.void
      },
    }),
  )

  const run = (extra: { readonly rateLimitWaits?: number } = {}) =>
    Effect.runPromise(
      processPage({
        organizationId: job.organizationId,
        projectId: job.projectId,
        importJobId: job.id,
        plan,
        isSandbox: deps.isSandbox ?? false,
        redactionPolicy: deps.redactionPolicy ?? null,
        ...extra,
      }).pipe(Effect.provide(layer)),
    )

  /** Drives the chain the way the worker does: each publish becomes the next invocation. */
  const drain = async (maxPages = 20) => {
    let result = await run()
    let pages = 1
    while (!result.done && pages < maxPages) {
      const next = published.at(-1)
      result = await run(
        next?.payload.rateLimitWaits !== undefined ? { rateLimitWaits: next.payload.rateLimitWaits } : {},
      )
      pages++
    }
    return { result, pages }
  }

  return {
    jobs,
    spans,
    published,
    written,
    events,
    fetchPageCalls,
    run,
    drain,
    stored: () => jobs.jobs.get(job.id),
  }
}

describe("processImportPageUseCase", () => {
  it("writes normalized spans and advances the cursor only after the page is written", async () => {
    const job = makeJob()
    const h = harness(job, { rows: fakeImportRows(25) })

    const result = await h.run()

    expect(result).toEqual({ done: false, reason: "next_page" })
    expect(h.spans.inserted.flat()).toHaveLength(10)
    expect(h.stored()?.cursor).toEqual(insideFirstWindow({ page: 1 }))
    expect(h.stored()?.status).toBe("running")
    expect(h.stored()?.stats).toMatchObject({ recordsFetched: 10, spansImported: 10, spansSkipped: 0 })
  })

  it("counts distinct sessions, a sessionless trace as its own", async () => {
    const row = (i: number, sessionId?: string): FakeImportRow => ({
      sourceTraceId: `trace-${i}`,
      sourceSpanId: `span-${i}`,
      name: `fake-span-${i}`,
      startTime: new Date(FAKE_ROWS_LATEST.getTime() - i * 60_000),
      isRoot: true,
      ...(sessionId !== undefined ? { sessionId } : {}),
    })
    // Two traces share a session, one names its own, one has none: three sessions.
    const job = makeJob()
    const h = harness(job, { rows: [row(0, "sess-a"), row(1, "sess-a"), row(2, "sess-b"), row(3)] })

    await h.drain()

    expect(h.stored()?.stats).toMatchObject({ sessionsImported: 3, tracesImported: 4 })
  })

  it("chains pages until the range is exhausted and ends succeeded", async () => {
    const job = makeJob()
    const h = harness(job, { rows: fakeImportRows(25) })

    const { result, pages } = await h.drain()

    expect(result).toEqual({ done: true, reason: "succeeded" })
    expect(pages).toBe(3)
    expect(h.spans.inserted.flat()).toHaveLength(25)
    expect(h.stored()?.stats).toMatchObject({ recordsFetched: 25, spansImported: 25 })
    expect(h.stored()?.finishedAt).toBeInstanceOf(Date)
  })

  it("scrubs credentials on every terminal transition", async () => {
    const job = makeJob()
    const h = harness(job, { rows: fakeImportRows(5) })

    await h.drain()

    expect(h.stored()?.status).toBe("succeeded")
    expect(h.stored()?.credentials).toBeNull()
  })

  it("records one run entry per page on the job, newest first", async () => {
    const job = makeJob()
    const h = harness(job, { rows: fakeImportRows(25) })

    await h.drain()

    const runs = h.stored()?.runs ?? []
    expect(runs).toHaveLength(3)
    expect(runs.map((r) => r.status)).toEqual(["succeeded", "succeeded", "succeeded"])
    // Newest first: the last page processed (5 rows, window exhausted) leads.
    expect(runs[0]).toMatchObject({
      cursor: { start: insideFirstWindow({ page: 2 }) },
      stats: { recordsFetched: 5, spansImported: 5, spansSkipped: 0 },
    })
    expect(runs[2]).toMatchObject({
      cursor: { start: insideFirstWindow(null), end: insideFirstWindow({ page: 1 }) },
      stats: { recordsFetched: 10, spansImported: 10, spansSkipped: 0 },
      error: null,
    })
  })

  describe("live ingest pipeline", () => {
    it("publishes TracesIngested for the page's traces so the normal pipeline runs", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(10) })

      await h.run()

      expect(h.events).toHaveLength(1)
      expect(h.events[0]).toMatchObject({
        name: "TracesIngested",
        organizationId: job.organizationId,
        payload: { projectId: job.projectId, isSandbox: false },
      })
      // 10 rows at 5 spans per trace.
      expect((h.events[0]?.payload.traceIds as readonly string[]).length).toBe(2)
    })

    it("carries the plan snapshot so imported traces are billed like ingested ones", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(5) })

      await h.run()

      expect(h.events[0]?.payload.billing).toMatchObject({
        planSlug: "pro",
        planSource: "subscription",
        overageAllowed: true,
      })
    })

    it("marks a sandbox org's import so the billing and LLM fan-out are skipped", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(5) }, { isSandbox: true })

      await h.run()

      expect(h.events[0]?.payload.isSandbox).toBe(true)
    })

    it("publishes nothing when every row in the page was skipped", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(2), skip: ["span-0", "span-1"] })

      await h.run()

      expect(h.events).toEqual([])
    })
  })

  describe("redaction", () => {
    const emailPolicy: RedactionPolicy = {
      entities: new Set(["email"]),
      redactMetadata: false,
      identities: "keep",
      rules: [],
    }

    it("redacts imported spans when the project has a policy", async () => {
      const job = makeJob()
      const h = harness(
        job,
        { rows: fakeImportRows(1), content: { input: "reach me at ada@example.com" } },
        { redactionPolicy: emailPolicy },
      )

      await h.run()

      const [span] = h.spans.inserted.flat()
      const text = JSON.stringify(span?.inputMessages)
      // Imports are a second content sink, so they must strip what ingest strips.
      expect(text).not.toContain("ada@example.com")
      expect(text).toContain("REDACTED")
    })

    it("leaves content alone when no policy applies", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(1), content: { input: "reach me at ada@example.com" } })

      await h.run()

      expect(JSON.stringify(h.spans.inserted.flat()[0]?.inputMessages)).toContain("ada@example.com")
    })

    it("redacts model output, not just input", async () => {
      const job = makeJob()
      const h = harness(
        job,
        { rows: fakeImportRows(1), content: { output: "confirmation sent to ada@example.com" } },
        { redactionPolicy: emailPolicy },
      )

      await h.run()

      expect(JSON.stringify(h.spans.inserted.flat()[0]?.outputMessages)).not.toContain("ada@example.com")
    })
  })

  describe("newest-first window walk", () => {
    it("reads the newest window first and walks backwards", async () => {
      const job = makeJob({
        config: { ...BASE_CONFIG, rangeFrom: new Date("2026-01-18T00:00:00Z") },
      })
      const h = harness(job, { rows: fakeImportRows(5) })

      await h.drain()

      const windowEnds = h.fetchPageCalls.map((call) => call.range.to.getTime())
      expect(windowEnds[0]).toBe(RANGE_TO.getTime())
      // Strictly decreasing: already sorted newest-first, and no window read twice.
      expect(windowEnds).toEqual([...windowEnds].sort((a, b) => b - a))
      expect(new Set(windowEnds).size).toBe(windowEnds.length)
    })

    it("never reads below the configured range start", async () => {
      const job = makeJob({ config: { ...BASE_CONFIG, rangeFrom: new Date("2026-01-05T00:00:00Z") } })
      const h = harness(job, { rows: fakeImportRows(5) })

      await h.drain(40)

      for (const call of h.fetchPageCalls) {
        expect(call.range.from.getTime()).toBeGreaterThanOrEqual(new Date("2026-01-05T00:00:00Z").getTime())
      }
    })

    it("widens over empty stretches so a sparse range does not cost a request per day", async () => {
      // 30 days of range with rows only in the newest day.
      const job = makeJob({ config: { ...BASE_CONFIG, rangeFrom: new Date("2025-12-22T00:00:00Z") } })
      const h = harness(job, { rows: fakeImportRows(5) })

      const { result, pages } = await h.drain(40)

      expect(result).toEqual({ done: true, reason: "succeeded" })
      // One request for the populated day, then a handful of widening empty windows —
      // far fewer than the 30 a fixed daily step would need.
      expect(pages).toBeLessThan(10)
    })

    it("imports the newest traces first when the trace ceiling stops it early", async () => {
      const job = makeJob({
        config: { ...withMaxTraces(1), rangeFrom: new Date("2026-01-18T00:00:00Z") },
      })
      // Two traces a day apart: the newer one is the one worth keeping.
      const h = harness(job, {
        rows: [
          {
            sourceTraceId: "newer",
            sourceSpanId: "newer-root",
            name: "newer",
            startTime: FAKE_ROWS_LATEST,
            isRoot: true,
          },
          {
            sourceTraceId: "older",
            sourceSpanId: "older-root",
            name: "older",
            startTime: new Date(FAKE_ROWS_LATEST.getTime() - 2 * IMPORT_WINDOW_BASE_MS),
            isRoot: true,
          },
        ],
      })

      const { result } = await h.drain()

      expect(result).toEqual({ done: true, reason: "succeeded" })
      expect(h.spans.inserted.flat().map((s) => s.name)).toEqual(["newer"])
    })
  })

  describe("ImportFinished analytics", () => {
    it("emits exactly one event, on the terminal page", async () => {
      const h = harness(makeJob(), { rows: fakeImportRows(25) })

      await h.drain()

      expect(h.written).toHaveLength(1)
      expect(h.written[0]).toMatchObject({
        eventName: "ImportFinished",
        aggregateType: "import-job",
        payload: {
          status: "succeeded",
          error: null,
          recordsFetched: 25,
          tracesImported: 5,
          spansImported: 25,
          spansSkipped: 0,
        },
      })
    })

    it.each([
      ["cancelled", () => makeJob({ cancelledAt: new Date() })],
      ["failed", () => makeJob({ credentials: null })],
    ])("reports %s as the terminal status", async (status, job) => {
      const h = harness(job(), { rows: fakeImportRows(25) })

      await h.drain()

      expect(h.written).toHaveLength(1)
      expect(h.written[0]?.payload).toMatchObject({ status })
    })

    it("reports why the plan capped it, in the same field a failure uses", async () => {
      const job = makeJob()
      const h = harness(
        job,
        { rows: fakeImportRows(25) },
        {
          plan: stubImportPlan(job.organizationId, {
            plan: {
              slug: FREE_PLAN_CONFIG.slug,
              includedCredits: FREE_PLAN_CONFIG.includedCredits,
              retentionDays: FREE_PLAN_CONFIG.retentionDays,
              overageAllowed: FREE_PLAN_CONFIG.overageAllowed,
              hardCapped: FREE_PLAN_CONFIG.hardCapped,
              priceCents: FREE_PLAN_CONFIG.priceCents,
            },
          }),
          consumedCredits: FREE_PLAN_CONFIG.includedCredits,
        },
      )

      await h.drain()

      expect(h.written[0]?.payload).toMatchObject({
        status: "capped",
        error: expect.stringContaining("plan usage") as unknown as string,
      })
    })

    it("emits nothing while the chain is still advancing", async () => {
      const h = harness(makeJob(), { rows: fakeImportRows(25) })

      await h.run()

      expect(h.written).toEqual([])
    })
  })

  it("bounds the run history so a long import cannot grow the job row without limit", async () => {
    // Enough pages to overflow the ring buffer several times over.
    const pages = IMPORT_RUN_HISTORY_LIMIT * 2
    const h = harness(makeJob(), { rows: fakeImportRows(pages * 10, { spacingMs: 1_000 }) })

    const { result } = await h.drain(pages + 5)

    expect(result).toEqual({ done: true, reason: "succeeded" })
    expect(h.stored()?.runs).toHaveLength(IMPORT_RUN_HISTORY_LIMIT)
    // The retained window is the most recent one: the newest entry is the final page.
    expect(h.stored()?.runs[0]?.cursor.end?.source).toBeNull()
  })

  it("keeps a failed page in the history alongside the successes that preceded it", async () => {
    const h = harness(makeJob(), {
      rows: fakeImportRows(25),
      failOn: {
        call: 2,
        error: new ImportSourceError({ category: "auth", message: "key revoked", retryable: false }),
      },
    })

    await h.run()
    await h.run()

    const runs = h.stored()?.runs ?? []
    expect(runs.map((r) => r.status)).toEqual(["failed", "succeeded"])
    expect(runs[0]?.error).toBe("auth: key revoked")
    // The failed page reports the cursor it was attempting, not a fabricated advance.
    expect(runs[0]?.cursor).toEqual({ start: insideFirstWindow({ page: 1 }), end: insideFirstWindow({ page: 1 }) })
  })

  it("is idempotent at the span id level when the same fixture is re-imported", async () => {
    const rows = fakeImportRows(25)
    const first = harness(makeJob(), { rows })
    await first.drain()
    const second = harness(makeJob(), { rows })
    await second.drain()

    const idsOf = (h: ReturnType<typeof harness>) =>
      h.spans.inserted
        .flat()
        .map((s) => `${s.traceId}:${s.spanId}`)
        .sort()

    expect(idsOf(second)).toEqual(idsOf(first))
    expect(new Set(idsOf(first)).size).toBe(25)
  })

  describe("trace ceiling", () => {
    it("counts traces by root span, not by span", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(25) })

      await h.drain()

      // 25 spans across 5 traces of 5 spans each.
      expect(h.stored()?.stats).toMatchObject({ tracesImported: 5, spansImported: 25 })
    })

    it("finishes succeeded when the ceiling truncates a page mid-way", async () => {
      const job = makeJob({ config: withMaxTraces(1) })
      const h = harness(job, { rows: fakeImportRows(25) })

      const { result } = await h.drain()

      expect(result).toEqual({ done: true, reason: "succeeded" })
      expect(h.stored()?.stats.tracesImported).toBe(1)
      expect(h.stored()?.status).toBe("succeeded")
      expect(h.stored()?.credentials).toBeNull()
      // Nothing to explain: the ceiling it met is the one the user set.
      expect(h.stored()?.error).toBeNull()
    })

    it("keeps whole traces rather than cutting one in half", async () => {
      const job = makeJob({ config: withMaxTraces(2) })
      const h = harness(job, { rows: fakeImportRows(25) })

      await h.drain()

      // Both admitted traces keep all five of their spans; the third trace's root is refused.
      expect(h.spans.inserted.flat()).toHaveLength(10)
    })

    // Only LangSmith sorts inside a window: Langfuse has no sort parameter and Braintrust's
    // ordering had to be added, so a page can arrive in any order. Truncating the arrival
    // order would keep an arbitrary subset of a window that may span up to 32 days.
    it("keeps the newest traces even when the source returns rows in the wrong order", async () => {
      const job = makeJob({ config: withMaxTraces(2) })
      const oldestFirst = [...fakeImportRows(25)].reverse()
      const h = harness(job, { rows: oldestFirst })

      await h.drain()

      const traceIds = new Set(h.spans.inserted.flat().map((span) => span.traceId))
      // trace-0 and trace-1 are the two newest; arrival order put them last.
      expect(traceIds.size).toBe(2)
      expect(h.stored()?.stats.tracesImported).toBe(2)
      expect(h.stored()?.status).toBe("succeeded")
    })

    it("admits spans whose root arrived in an earlier page without charging the budget again", async () => {
      const job = makeJob({ config: withMaxTraces(1) })
      const h = harness(job, {
        rows: [
          // A continuation of a trace counted by an earlier page: no root here, so no charge.
          {
            sourceTraceId: "trace-earlier",
            sourceSpanId: "span-late",
            name: "late child",
            startTime: new Date(FAKE_ROWS_LATEST.getTime() - 1_000),
            isRoot: false,
          },
          {
            sourceTraceId: "trace-0",
            sourceSpanId: "span-root",
            name: "root",
            startTime: new Date(FAKE_ROWS_LATEST.getTime() - 2_000),
            isRoot: true,
          },
        ],
      })

      await h.drain()

      // Both land: dropping the orphan would strand a trace the budget already paid for,
      // and only the rooted trace counts against the ceiling of one.
      expect(h.spans.inserted.flat()).toHaveLength(2)
      expect(h.stored()?.stats.tracesImported).toBe(1)
    })

    // An empty page reads the same as an empty window, and the fail-loud cursor guard only
    // fires on a full page, so a source answering everything with no rows used to finish as a
    // clean success with nothing imported.
    it("says so when the whole range came back empty", async () => {
      const job = makeJob()
      const h = harness(job, { rows: [] })

      const { result } = await h.drain()

      expect(result).toEqual({ done: true, reason: "succeeded" })
      expect(h.stored()?.stats.recordsFetched).toBe(0)
      expect(h.stored()?.error).toContain("No traces were found")
    })

    it("leaves error null when the range genuinely held traces", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(5) })

      await h.drain()

      expect(h.stored()?.status).toBe("succeeded")
      expect(h.stored()?.error).toBeNull()
    })

    it("reports succeeded when the range runs out exactly at the ceiling", async () => {
      const job = makeJob({ config: withMaxTraces(4) })
      const h = harness(job, { rows: fakeImportRows(20) })

      const { result } = await h.drain()

      expect(result).toEqual({ done: true, reason: "succeeded" })
      expect(h.stored()?.status).toBe("succeeded")
      expect(h.stored()?.error).toBeNull()
      expect(h.spans.inserted.flat()).toHaveLength(20)
    })

    it("short-circuits to succeeded when a resumed job is already at its ceiling", async () => {
      const job = makeJob({
        config: withMaxTraces(2),
        stats: { recordsFetched: 10, sessionsImported: 2, tracesImported: 2, spansImported: 10, spansSkipped: 0 },
      })
      const h = harness(job, { rows: fakeImportRows(25) })

      const result = await h.run()

      expect(result).toEqual({ done: true, reason: "succeeded" })
      expect(h.fetchPageCalls).toHaveLength(0)
    })
  })

  describe("plan usage ceiling", () => {
    const freePlan = (organizationId: OrganizationId) =>
      stubImportPlan(organizationId, {
        plan: {
          slug: FREE_PLAN_CONFIG.slug,
          includedCredits: FREE_PLAN_CONFIG.includedCredits,
          retentionDays: FREE_PLAN_CONFIG.retentionDays,
          overageAllowed: FREE_PLAN_CONFIG.overageAllowed,
          hardCapped: FREE_PLAN_CONFIG.hardCapped,
          priceCents: FREE_PLAN_CONFIG.priceCents,
        },
      })

    it("caps without failing when the plan's usage is already spent", async () => {
      const job = makeJob()
      const h = harness(
        job,
        { rows: fakeImportRows(25) },
        { plan: freePlan(job.organizationId), consumedCredits: FREE_PLAN_CONFIG.includedCredits },
      )

      const result = await h.run()

      expect(result).toEqual({ done: true, reason: "capped" })
      expect(h.stored()?.status).toBe("capped")
      expect(h.stored()?.error).toContain("plan usage")
      expect(h.fetchPageCalls).toHaveLength(0)
    })

    it("finishes capped when the plan budget truncates a page", async () => {
      const job = makeJob({ config: { ...BASE_CONFIG, sourcePageSize: 100 } })
      const h = harness(
        job,
        { rows: fakeImportRows(50) },
        {
          plan: freePlan(job.organizationId),
          consumedCredits: FREE_PLAN_CONFIG.includedCredits - 3,
        },
      )

      const { result } = await h.drain()

      expect(result).toEqual({ done: true, reason: "capped" })
      expect(h.stored()?.status).toBe("capped")
      expect(h.stored()?.error).toContain("plan usage")
      expect(h.stored()?.stats.tracesImported).toBe(3)
      expect(h.events.at(-1)?.payload.traceIds).toHaveLength(3)
    })

    it("still finishes succeeded when the user's own ceiling is the tighter bound", async () => {
      const job = makeJob({ config: { ...withMaxTraces(3), sourcePageSize: 100 } })
      const h = harness(
        job,
        { rows: fakeImportRows(50) },
        {
          plan: freePlan(job.organizationId),
          consumedCredits: FREE_PLAN_CONFIG.includedCredits - 10,
        },
      )

      const { result } = await h.drain()

      expect(result).toEqual({ done: true, reason: "succeeded" })
      expect(h.stored()?.status).toBe("succeeded")
      expect(h.stored()?.error).toBeNull()
      expect(h.stored()?.stats.tracesImported).toBe(3)
    })

    it("counts unseen rootless traces against the plan budget", async () => {
      const job = makeJob({ config: { ...BASE_CONFIG, sourcePageSize: 100 } })
      const rows = Array.from({ length: 10 }, (_, i) => ({
        sourceTraceId: `rootless-${i}`,
        sourceSpanId: `child-${i}`,
        name: `child-${i}`,
        startTime: new Date(FAKE_ROWS_LATEST.getTime() - i * 60_000),
        isRoot: false,
      }))
      const h = harness(
        job,
        { rows },
        {
          plan: freePlan(job.organizationId),
          consumedCredits: FREE_PLAN_CONFIG.includedCredits - 3,
        },
      )

      const { result } = await h.drain()

      expect(result).toEqual({ done: true, reason: "capped" })
      expect(h.stored()?.status).toBe("capped")
      expect(h.stored()?.error).toContain("plan usage")
      expect(h.stored()?.stats.tracesImported).toBe(3)
      expect(h.events.at(-1)?.payload.traceIds).toHaveLength(3)
      expect(h.spans.inserted.flat()).toHaveLength(3)
    })

    it("does not charge continuation spans of already-imported traces", async () => {
      const job = makeJob({ config: { ...BASE_CONFIG, sourcePageSize: 100 } })
      const earlierTraceId = fakeImportHexId("trace-earlier", 32)
      const rows: FakeImportRow[] = [
        {
          sourceTraceId: "trace-earlier",
          sourceSpanId: "span-late",
          name: "late child",
          startTime: new Date(FAKE_ROWS_LATEST.getTime() - 1_000),
          isRoot: false,
        },
        ...Array.from({ length: 10 }, (_, i) => ({
          sourceTraceId: `rootless-${i}`,
          sourceSpanId: `child-${i}`,
          name: `child-${i}`,
          startTime: new Date(FAKE_ROWS_LATEST.getTime() - (i + 2) * 60_000),
          isRoot: false,
        })),
      ]
      const h = harness(
        job,
        { rows },
        {
          plan: freePlan(job.organizationId),
          consumedCredits: FREE_PLAN_CONFIG.includedCredits - 3,
          seedSpans: [
            stubSpanDetail({
              organizationId: job.organizationId,
              projectId: job.projectId,
              traceId: TraceId(earlierTraceId),
            }),
          ],
        },
      )

      const { result } = await h.drain()

      expect(result).toEqual({ done: true, reason: "capped" })
      expect(h.stored()?.stats.tracesImported).toBe(3)
      expect(h.events.at(-1)?.payload.traceIds).toHaveLength(4)
      expect(h.spans.inserted.flat()).toHaveLength(5)
    })

    it("keeps importing while the plan still has room", async () => {
      const job = makeJob()
      const h = harness(
        job,
        { rows: fakeImportRows(25) },
        { plan: freePlan(job.organizationId), consumedCredits: FREE_PLAN_CONFIG.includedCredits - 10 },
      )

      const { result } = await h.drain()

      expect(result).toEqual({ done: true, reason: "succeeded" })
    })

    it("ignores the usage ceiling for a sandbox org, which is never billed", async () => {
      const job = makeJob()
      const h = harness(
        job,
        { rows: fakeImportRows(5) },
        {
          plan: freePlan(job.organizationId),
          consumedCredits: FREE_PLAN_CONFIG.includedCredits,
          isSandbox: true,
        },
      )

      const { result } = await h.drain()

      expect(result).toEqual({ done: true, reason: "succeeded" })
    })
  })

  describe("cancellation", () => {
    it("stops before fetching when cancellation was requested", async () => {
      const job = makeJob({ cancelledAt: new Date("2026-03-01T00:00:00Z") })
      const h = harness(job, { rows: fakeImportRows(25) })

      const result = await h.run()

      expect(result).toEqual({ done: true, reason: "cancelled" })
      expect(h.fetchPageCalls).toHaveLength(0)
      expect(h.stored()?.status).toBe("cancelled")
      expect(h.stored()?.credentials).toBeNull()
    })

    it("keeps spans already imported by earlier pages", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(25) })

      await h.run()
      const importedBeforeCancel = h.spans.inserted.flat().length
      const stored = h.stored()
      if (stored) h.jobs.jobs.set(stored.id, { ...stored, cancelledAt: new Date() })
      const result = await h.run()

      expect(result).toEqual({ done: true, reason: "cancelled" })
      expect(importedBeforeCancel).toBe(10)
      expect(h.stored()?.stats.spansImported).toBe(10)
    })
  })

  describe("guards", () => {
    it("does nothing when the job is missing", async () => {
      const job = makeJob()
      const h = harness(job)
      h.jobs.jobs.clear()

      expect(await h.run()).toEqual({ done: true, reason: "not_found" })
    })

    it.each([
      ["succeeded" as const],
      ["capped" as const],
      ["cancelled" as const],
      ["failed" as const],
    ])("does nothing when the job is already %s", async (status) => {
      const h = harness(makeJob({ status }))

      expect(await h.run()).toEqual({ done: true, reason: "terminal" })
      expect(h.fetchPageCalls).toHaveLength(0)
    })

    it("refuses a payload whose project does not match the job", async () => {
      const job = makeJob()
      const h = harness(job)
      const plan = stubImportPlan(job.organizationId)

      const result = await Effect.runPromise(
        processImportPageUseCase({
          publishNextPage: () => Effect.void,
          eventsPublisher: { publish: () => Effect.void },
        })({
          organizationId: job.organizationId,
          projectId: ProjectId(generateId()),
          importJobId: job.id,
          plan,
          isSandbox: false,
          redactionPolicy: null,
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(ImportJobRepository, h.jobs.repository),
              Layer.succeed(ImportSourceAdapters, createFakeImportAdapterRegistry().registry),
              Layer.succeed(SpanRepository, h.spans.repository),
              Layer.succeed(BillingUsagePeriodRepository, createFakeBillingUsagePeriodRepository().repository),
              Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: job.organizationId })),
              Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: job.organizationId })),
              Layer.succeed(OutboxEventWriter, { write: () => Effect.void }),
            ),
          ),
        ),
      )

      expect(result).toEqual({ done: true, reason: "mismatch" })
    })

    it("fails the job when credentials were already scrubbed", async () => {
      const h = harness(makeJob({ credentials: null }))

      expect(await h.run()).toEqual({ done: true, reason: "failed" })
      expect(h.stored()?.error).toBe("Missing credentials")
    })
  })

  describe("source failures", () => {
    it("fails the job outright on a non-retryable error and records the run", async () => {
      const h = harness(makeJob(), {
        failOn: {
          call: 1,
          error: new ImportSourceError({
            category: "auth",
            message: "authentication failed",
            retryable: false,
            upstreamStatus: 401,
          }),
        },
      })

      expect(await h.run()).toEqual({ done: true, reason: "failed" })
      expect(h.stored()?.status).toBe("failed")
      expect(h.stored()?.error).toBe("[401] auth: authentication failed")
      expect(h.stored()?.credentials).toBeNull()
      expect(h.stored()?.runs).toHaveLength(1)
      expect(h.stored()?.runs[0]).toMatchObject({ status: "failed", error: "[401] auth: authentication failed" })
    })

    it("propagates a retryable error so the queue retries the page", async () => {
      const h = harness(makeJob(), {
        failOn: {
          call: 1,
          error: new ImportSourceError({ category: "server_error", message: "upstream", retryable: true }),
        },
      })

      await expect(h.run()).rejects.toThrow()
      expect(h.stored()?.status).toBe("running")
      expect(h.stored()?.cursor).toBeNull()
      expect(h.stored()?.runs[0]).toMatchObject({ status: "failed" })
    })

    it("leaves the cursor untouched when a page fails", async () => {
      const job = makeJob({ cursor: insideFirstWindow({ page: 3 }) })
      const h = harness(job, {
        failOn: {
          call: 1,
          error: new ImportSourceError({ category: "auth", message: "nope", retryable: false }),
        },
      })

      await h.run()

      expect(h.stored()?.cursor).toEqual(insideFirstWindow({ page: 3 }))
    })

    it("converts a hung source into a retryable timeout", async () => {
      const h = harness(makeJob(), { hang: true }, { pageTimeoutMs: 20 })

      await expect(h.run()).rejects.toThrow()
      expect(h.stored()?.runs[0]?.error).toBe("transport: Source page timed out after 20ms")
      expect(h.stored()?.status).toBe("running")
      expect(h.stored()?.credentials).not.toBeNull()
    })

    it("bounds a real page at the documented budget", () => {
      expect(IMPORT_PAGE_TIMEOUT_MS).toBe(120_000)
    })
  })

  describe("rate limiting", () => {
    it("paces the next page by the source's request interval", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(25) })

      await h.run()

      expect(h.published).toHaveLength(1)
      expect(h.published[0]?.delayMs).toBe(sourceRequestIntervalMs("langfuse"))
    })

    it("paces LangSmith more slowly than Langfuse", () => {
      expect(sourceRequestIntervalMs("langsmith")).toBeGreaterThan(sourceRequestIntervalMs("langfuse"))
      expect(sourceRequestIntervalMs("langsmith")).toBe(5_000)
    })

    it("defers the same page by Retry-After instead of failing", async () => {
      const h = harness(makeJob(), {
        failOn: {
          call: 1,
          error: new ImportSourceError({
            category: "rate_limited",
            message: "slow down",
            retryable: true,
            retryAfterMs: 30_000,
            upstreamStatus: 429,
          }),
        },
      })

      const result = await h.run()

      expect(result).toEqual({ done: false, reason: "rate_limited" })
      expect(h.published[0]?.delayMs).toBe(30_000)
      expect(h.published[0]?.payload.rateLimitWaits).toBe(1)
      expect(h.stored()?.status).toBe("running")
      expect(h.stored()?.credentials).not.toBeNull()
    })

    it("gives up after the bounded number of Retry-After waits", async () => {
      const h = harness(makeJob(), {
        failOn: {
          call: 1,
          error: new ImportSourceError({
            category: "rate_limited",
            message: "slow down",
            retryable: true,
            retryAfterMs: 30_000,
            upstreamStatus: 429,
          }),
        },
      })

      const result = await h.run({ rateLimitWaits: IMPORT_MAX_RATE_LIMIT_WAITS })

      expect(result).toEqual({ done: true, reason: "failed" })
      expect(h.stored()?.error).toContain("gave up after")
      expect(h.published).toHaveLength(0)
    })

    it("clamps an absurd Retry-After to the ceiling", async () => {
      const h = harness(makeJob(), {
        failOn: {
          call: 1,
          error: new ImportSourceError({
            category: "rate_limited",
            message: "slow down",
            retryable: true,
            retryAfterMs: 99_999_999,
          }),
        },
      })

      await h.run()

      expect(h.published[0]?.delayMs).toBe(600_000)
    })

    it("falls back to queue retry for a 429 with no Retry-After", async () => {
      const h = harness(makeJob(), {
        failOn: {
          call: 1,
          error: new ImportSourceError({ category: "rate_limited", message: "slow down", retryable: true }),
        },
      })

      await expect(h.run()).rejects.toThrow()
      expect(h.published).toHaveLength(0)
    })
  })

  describe("normalization", () => {
    it("counts skipped rows without importing them", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(10), skip: ["span-2", "span-7"] })

      await h.drain()

      expect(h.spans.inserted.flat()).toHaveLength(8)
      expect(h.stored()?.stats).toMatchObject({ recordsFetched: 10, spansImported: 8, spansSkipped: 2 })
    })

    it("stamps import provenance onto every span", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(3) })

      await h.drain()

      for (const span of h.spans.inserted.flat()) {
        expect(span.metadata["import.job_id"]).toBe(job.id)
        expect(span.metadata["import.source"]).toBe("langfuse")
        expect(span.metadata["import.source_project_id"]).toBe("project-1")
        expect(span.metadata["import.source_trace_id"]).toBeDefined()
        expect(span.metadata["import.source_span_id"]).toBeDefined()
      }
    })

    it("stamps the plan's retention onto imported spans", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(3) })

      await h.drain()

      for (const span of h.spans.inserted.flat()) {
        expect(span.retentionDays).toBe(90)
      }
    })

    it("passes the window, cursor and page size to the adapter", async () => {
      const job = makeJob()
      const h = harness(job, { rows: fakeImportRows(25) })

      await h.run()
      await h.run()

      expect(h.fetchPageCalls[0]).toMatchObject({
        sourceProjectId: "project-1",
        limit: 10,
        cursor: null,
        range: { from: RANGE_FROM, to: RANGE_TO },
      })
      expect(h.fetchPageCalls[1]?.cursor).toEqual({ page: 1 })
    })
  })
})

describe("recordImportFinalFailureUseCase", () => {
  const record = (job: ImportJob, error: Error, now = new Date("2026-03-01T00:05:00Z")) =>
    recordImportFinalFailureUseCase({
      organizationId: job.organizationId,
      projectId: job.projectId,
      importJobId: job.id,
      error,
      now,
    })

  const RATE_LIMITED = new ImportSourceError({
    category: "rate_limited",
    message: "Too many requests",
    retryable: true,
    upstreamStatus: 429,
  })

  it.each([
    ["created" as const],
    ["queued" as const],
    ["running" as const],
  ])("marks a %s job failed and clears credentials once retries are exhausted", async (status) => {
    const job = stubImportJob({ status, startedAt: new Date("2026-03-01T00:00:00Z") })
    const h = importHarness({ seed: [job] })
    const finishedAt = new Date("2026-03-01T00:05:00Z")

    const result = await Effect.runPromise(record(job, RATE_LIMITED, finishedAt).pipe(Effect.provide(h.layer)))

    expect(result).toEqual({ recorded: true })
    const stored = h.stored.get(job.id)
    expect(stored?.status).toBe("failed")
    expect(stored?.error).toBe("[429] rate_limited: Too many requests")
    expect(stored?.finishedAt).toBe(finishedAt)
    expect(stored?.credentials).toBeNull()
  })

  // The sanitizer is what keeps a source's own error text out of the row unrecognized.
  it("records a generic reason for a failure that is not a source error", async () => {
    const job = stubImportJob({ status: "running" })
    const h = importHarness({ seed: [job] })

    await Effect.runPromise(record(job, new Error("ECONNRESET at 10.0.0.4")).pipe(Effect.provide(h.layer)))

    expect(h.stored.get(job.id)?.error).toBe("Import retries exhausted")
  })

  it.each([
    ["succeeded" as const],
    ["capped" as const],
    ["cancelled" as const],
    ["failed" as const],
  ])("does not overwrite a %s job from a stale hook", async (status) => {
    const finishedAt = new Date("2026-03-01T00:05:00Z")
    const job = stubImportJob({ status, finishedAt, credentials: null })
    const h = importHarness({ seed: [job] })

    const result = await Effect.runPromise(
      record(job, new Error("stale retry"), new Date("2026-03-01T00:10:00Z")).pipe(Effect.provide(h.layer)),
    )

    expect(result).toEqual({ recorded: false, reason: "terminal" })
    expect(h.stored.get(job.id)?.status).toBe(status)
    expect(h.stored.get(job.id)?.finishedAt).toBe(finishedAt)
    expect(h.stored.get(job.id)?.error).toBeNull()
  })

  it("reports a deleted job rather than failing the hook", async () => {
    const job = stubImportJob({ status: "running" })
    const h = importHarness()

    const result = await Effect.runPromise(record(job, new Error("gone")).pipe(Effect.provide(h.layer)))

    expect(result).toEqual({ recorded: false, reason: "not_found" })
  })

  it.each([
    ["organization", { organizationId: OrganizationId("x".repeat(24)) }],
    ["project", { projectId: ProjectId("y".repeat(24)) }],
  ])("refuses a hook whose %s does not match the job", async (_label, mismatch) => {
    const job = stubImportJob({ status: "running" })
    const h = importHarness({ seed: [job] })

    const result = await Effect.runPromise(
      recordImportFinalFailureUseCase({
        organizationId: job.organizationId,
        projectId: job.projectId,
        importJobId: job.id,
        error: new Error("misrouted"),
        now: new Date("2026-03-01T00:05:00Z"),
        ...mismatch,
      }).pipe(Effect.provide(h.layer)),
    )

    expect(result).toEqual({ recorded: false, reason: "mismatch" })
    expect(h.stored.get(job.id)?.status).toBe("running")
  })
})
