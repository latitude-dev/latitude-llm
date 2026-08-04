import type { ImportConfig, NormalizeContext } from "@domain/imports"
import { OrganizationId, ProjectId } from "@domain/shared"
import { Effect, Exit } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createLangfuseAdapter } from "./adapter.ts"

const CREDENTIALS = {
  kind: "langfuse" as const,
  region: "eu" as const,
  publicKey: "pk-test",
  secretKey: "sk-test",
}

const CONFIG: ImportConfig = {
  sourceProjectId: "lf-project",
  sourceProjectName: "LF Project",
  sourceRegion: "eu",
  sourceBaseUrl: "https://cloud.langfuse.com",
  rangeFrom: new Date("2026-01-01T00:00:00Z"),
  rangeTo: new Date("2026-02-01T00:00:00Z"),
  maxTraces: 1_000,
  sourcePageSize: 1_000,
}

const CONTEXT: NormalizeContext = {
  organizationId: OrganizationId("org1234567890123456789012"),
  projectId: ProjectId("prj1234567890123456789012"),
  importJobId: "job1234567890123456789012",
  source: "langfuse",
  sourceProjectId: "lf-project",
  ingestedAt: new Date("2026-03-01T00:00:00Z"),
  retentionDays: 30,
}

const RANGE = { from: CONFIG.rangeFrom, to: CONFIG.rangeTo }

const fetchPage = (
  adapter: ReturnType<typeof createLangfuseAdapter>,
  cursor: { readonly cursor: string } | null,
  limit: number,
) =>
  adapter.fetchPage({
    credentials: CREDENTIALS,
    sourceProjectId: "lf-project",
    config: CONFIG,
    cursor,
    range: RANGE,
    limit,
  })

/** Serves one canned JSON body per request and records the URLs asked for. */
const stubTransport = (bodies: readonly unknown[]) => {
  const requestedUrls: string[] = []
  let call = 0
  const fetchImpl = vi.fn(async (url: string) => {
    requestedUrls.push(String(url))
    const body = bodies[Math.min(call, bodies.length - 1)]
    call++
    return new Response(JSON.stringify(body), { status: 200 })
  })
  vi.stubGlobal("fetch", fetchImpl)
  return { adapter: createLangfuseAdapter(), requestedUrls, fetchImpl }
}

describe("Langfuse adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("region routing", () => {
    it("builds requests against the origin the credentials' region names", async () => {
      const { adapter, requestedUrls } = stubTransport([{ data: [] }])

      await Effect.runPromise(adapter.listProjects({ credentials: CREDENTIALS, limit: 10 }))

      expect(requestedUrls).toEqual(["https://cloud.langfuse.com/api/public/projects"])
    })

    // The user picks a region and never a URL, so this table is the only thing that decides
    // where a request goes.
    it.each([
      ["eu" as const, "https://cloud.langfuse.com"],
      ["us" as const, "https://us.cloud.langfuse.com"],
      ["jp" as const, "https://jp.cloud.langfuse.com"],
      ["hipaa-us" as const, "https://hipaa.cloud.langfuse.com"],
    ])("routes the %s region to %s", async (region, baseUrl) => {
      const { adapter, requestedUrls } = stubTransport([{ data: [] }])

      await Effect.runPromise(adapter.testConnection({ credentials: { ...CREDENTIALS, region } }))

      expect(requestedUrls).toEqual([`${baseUrl}/api/public/projects`])
    })

    // A job settled on one region keeps talking to it, even if fresh credentials name another.
    it("pages against the job's snapshot rather than the credentials' region", async () => {
      const { adapter, requestedUrls } = stubTransport([{ data: [], meta: { cursor: null } }])

      await Effect.runPromise(
        adapter.fetchPage({
          credentials: { ...CREDENTIALS, region: "us" },
          sourceProjectId: "lf-project",
          config: { ...CONFIG, sourceRegion: "jp", sourceBaseUrl: "https://jp.cloud.langfuse.com" },
          cursor: null,
          range: RANGE,
          limit: 10,
        }),
      )

      expect(requestedUrls[0]).toContain("https://jp.cloud.langfuse.com/api/public/v2/observations")
    })

    it("rejects credentials belonging to another source", async () => {
      const { adapter, fetchImpl } = stubTransport([{ data: [] }])

      await expect(
        Effect.runPromise(adapter.testConnection({ credentials: { kind: "braintrust", region: "us", apiKey: "bt" } })),
      ).rejects.toMatchObject({ category: "config", retryable: false })
      expect(fetchImpl).not.toHaveBeenCalled()
    })
  })

  describe("fetchPage", () => {
    it("reads the v2 endpoint with the time window and page size", async () => {
      const { adapter, requestedUrls } = stubTransport([{ data: [] }])

      await Effect.runPromise(fetchPage(adapter, null, 500))

      const url = new URL(requestedUrls[0] ?? "")
      // v1 `/api/public/observations` is deprecated and slated for removal.
      expect(url.pathname).toBe("/api/public/v2/observations")
      expect(url.searchParams.get("limit")).toBe("500")
      // The documented parameter names — the previous `fromTimestamp`/`toTimestamp` were
      // silently ignored, so every import read the project's whole history.
      expect(url.searchParams.get("fromStartTime")).toBe(CONFIG.rangeFrom.toISOString())
      expect(url.searchParams.get("toStartTime")).toBe(CONFIG.rangeTo.toISOString())
    })

    it("asks for every field group it maps, since v2 omits what is not requested", async () => {
      const { adapter, requestedUrls } = stubTransport([{ data: [] }])

      await Effect.runPromise(fetchPage(adapter, null, 10))

      const fields = new URL(requestedUrls[0] ?? "").searchParams.get("fields")?.split(",") ?? []
      // Without these the import would write spans with no content, metadata, model, usage,
      // tags or time-to-first-token and still look like it succeeded.
      expect(fields).toEqual(
        expect.arrayContaining([
          "core",
          "basic",
          "time",
          "io",
          "metadata",
          "model",
          "usage",
          "prompt",
          "trace_context",
        ]),
      )
    })

    it("clamps the page size to the v2 maximum", async () => {
      const { adapter, requestedUrls } = stubTransport([{ data: [] }])

      await Effect.runPromise(fetchPage(adapter, null, 5_000))

      expect(new URL(requestedUrls[0] ?? "").searchParams.get("limit")).toBe("1000")
    })

    it("sends no project parameter, because the key already scopes one", async () => {
      const { adapter, requestedUrls } = stubTransport([{ data: [] }])

      await Effect.runPromise(fetchPage(adapter, null, 10))

      expect(new URL(requestedUrls[0] ?? "").searchParams.has("projectId")).toBe(false)
    })

    it("follows the continuation cursor the API returns", async () => {
      const { adapter } = stubTransport([{ data: [{ id: "o1", traceId: "t1" }], meta: { cursor: "next-token" } }])

      const page = await Effect.runPromise(fetchPage(adapter, null, 10))

      expect(page.hasMore).toBe(true)
      expect(page.nextCursor).toEqual({ cursor: "next-token" })
    })

    it("sends the cursor back on the next request", async () => {
      const { adapter, requestedUrls } = stubTransport([{ data: [] }])

      await Effect.runPromise(fetchPage(adapter, { cursor: "token-1" }, 10))

      expect(new URL(requestedUrls[0] ?? "").searchParams.get("cursor")).toBe("token-1")
    })

    it("omits the cursor entirely on the first request", async () => {
      const { adapter, requestedUrls } = stubTransport([{ data: [] }])

      await Effect.runPromise(fetchPage(adapter, null, 10))

      expect(new URL(requestedUrls[0] ?? "").searchParams.has("cursor")).toBe(false)
    })

    it("stops when the response carries no further cursor", async () => {
      const { adapter } = stubTransport([{ data: [{ id: "o1", traceId: "t1" }], meta: {} }])

      const page = await Effect.runPromise(fetchPage(adapter, null, 10))

      expect(page.hasMore).toBe(false)
      expect(page.nextCursor).toBeNull()
    })

    it("fails rather than silently dropping the rest of a full page with no cursor", async () => {
      const { adapter } = stubTransport([
        {
          data: [
            { id: "o1", traceId: "t1" },
            { id: "o2", traceId: "t1" },
          ],
          meta: {},
        },
      ])

      const exit = await Effect.runPromiseExit(fetchPage(adapter, null, 2))

      expect(Exit.isFailure(exit)).toBe(true)
      expect(JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)).toContain("without a pagination cursor")
    })

    it("stops on a partial page with no cursor", async () => {
      const { adapter } = stubTransport([{ data: [{ id: "o1", traceId: "t1" }] }])

      const page = await Effect.runPromise(fetchPage(adapter, null, 10))

      expect(page.hasMore).toBe(false)
    })

    it("maps upstream statuses to error categories", async () => {
      for (const [status, expected] of [
        [401, { category: "auth", retryable: false }],
        [403, { category: "auth", retryable: false }],
        [429, { category: "rate_limited", retryable: true }],
        [503, { category: "server_error", retryable: true }],
        [422, { category: "config", retryable: false }],
      ] as const) {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => new Response("{}", { status })),
        )
        const adapter = createLangfuseAdapter()

        await expect(
          Effect.runPromise(
            adapter.fetchPage({
              credentials: CREDENTIALS,
              sourceProjectId: "lf-project",
              config: CONFIG,
              cursor: null,
              range: RANGE,
              limit: 10,
            }),
          ),
        ).rejects.toMatchObject({ ...expected, upstreamStatus: status })
      }
    })
  })

  describe("trace context join", () => {
    it("attaches session, user and tags from the trace list to each row", async () => {
      const { adapter } = stubTransport([
        { data: [{ id: "o1", traceId: "t1" }], meta: { cursor: null } },
        { data: [{ id: "t1", sessionId: "sess-a", userId: "user-a", tags: ["prod"] }] },
      ])

      const page = await Effect.runPromise(
        adapter.fetchPage({
          credentials: CREDENTIALS,
          sourceProjectId: "lf-project",
          config: CONFIG,
          cursor: null,
          range: RANGE,
          limit: 10,
        }),
      )

      expect(page.rows[0]).toMatchObject({
        id: "o1",
        traceContext: { sessionId: "sess-a", userId: "user-a", tags: ["prod"] },
      })
    })

    it("does not ask for trace context when the page is empty", async () => {
      const { adapter, requestedUrls } = stubTransport([{ data: [], meta: { cursor: null } }])

      await Effect.runPromise(
        adapter.fetchPage({
          credentials: CREDENTIALS,
          sourceProjectId: "lf-project",
          config: CONFIG,
          cursor: null,
          range: RANGE,
          limit: 10,
        }),
      )

      expect(requestedUrls).toHaveLength(1)
    })

    // The trace list rejects `limit` over 100 with a 400 instead of clamping, and it is a tenth
    // of the observation page's ceiling. Asking for the observation page size failed every
    // Langfuse preview and import outright.
    it("never asks the trace list for more than the 100 rows it allows", async () => {
      const { adapter, requestedUrls } = stubTransport([
        { data: [{ id: "o1", traceId: "t1" }], meta: { cursor: null } },
        { data: [{ id: "t1" }], meta: { totalPages: 1 } },
      ])

      await Effect.runPromise(
        adapter.fetchPage({
          credentials: CREDENTIALS,
          sourceProjectId: "lf-project",
          config: CONFIG,
          cursor: null,
          range: RANGE,
          limit: 1_000,
        }),
      )

      const traceUrl = requestedUrls.find((url) => url.includes("/api/public/traces"))
      expect(new URL(traceUrl ?? "").searchParams.get("limit")).toBe("100")
    })

    it("pages the trace list until every trace on the page is covered", async () => {
      const { adapter, requestedUrls } = stubTransport([
        {
          data: [
            { id: "o1", traceId: "t1" },
            { id: "o2", traceId: "t99" },
          ],
          meta: { cursor: null },
        },
        { data: [{ id: "t1", sessionId: "sess-a" }], meta: { totalPages: 2 } },
        { data: [{ id: "t99", sessionId: "sess-b" }], meta: { totalPages: 2 } },
      ])

      const page = await Effect.runPromise(
        adapter.fetchPage({
          credentials: CREDENTIALS,
          sourceProjectId: "lf-project",
          config: CONFIG,
          cursor: null,
          range: RANGE,
          limit: 10,
        }),
      )

      expect(requestedUrls.filter((url) => url.includes("/api/public/traces"))).toHaveLength(2)
      expect(page.rows.map((row) => row.traceContext?.sessionId)).toEqual(["sess-a", "sess-b"])
    })

    it("stops paging as soon as the page's traces are covered", async () => {
      const { adapter, requestedUrls } = stubTransport([
        { data: [{ id: "o1", traceId: "t1" }], meta: { cursor: null } },
        { data: [{ id: "t1", sessionId: "sess-a" }], meta: { totalPages: 50 } },
      ])

      await Effect.runPromise(
        adapter.fetchPage({
          credentials: CREDENTIALS,
          sourceProjectId: "lf-project",
          config: CONFIG,
          cursor: null,
          range: RANGE,
          limit: 10,
        }),
      )

      expect(requestedUrls.filter((url) => url.includes("/api/public/traces"))).toHaveLength(1)
    })

    // Degrading to the observation's own session beats failing an import because a window is
    // denser than the bounded walk can cover.
    it("keeps importing when a trace's context cannot be resolved", async () => {
      const { adapter } = stubTransport([
        { data: [{ id: "o1", traceId: "t-unlisted", sessionId: "sess-fallback" }], meta: { cursor: null } },
        { data: [], meta: { totalPages: 1 } },
      ])

      const page = await Effect.runPromise(
        adapter.fetchPage({
          credentials: CREDENTIALS,
          sourceProjectId: "lf-project",
          config: CONFIG,
          cursor: null,
          range: RANGE,
          limit: 10,
        }),
      )

      const row = page.rows[0]
      expect(row?.traceContext).toBeUndefined()
      const normalized = adapter.normalize(row ?? {}, CONTEXT, CONFIG)
      expect(normalized.status === "ok" && normalized.span.sessionId).toBe("sess-fallback")
    })
  })

  describe("preview", () => {
    it("reports the exact trace count from the trace list", async () => {
      // Observations, then the count, then the trace-context join.
      const { adapter } = stubTransport([
        { data: [{ id: "o1", traceId: "t1" }] },
        { data: [], meta: { totalItems: 9 } },
        { data: [{ id: "t1", sessionId: "sess-a", userId: "user-a", tags: ["prod"] }] },
      ])

      const preview = await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "lf-project",
          config: CONFIG,
          range: RANGE,
          maxRecords: 5_000,
        }),
      )

      expect(preview.estimatedTraces).toBe(9)
      // 9 traces fits inside CONFIG.maxTraces, so there is nothing to caveat.
      expect(preview.warnings).toEqual([])
    })

    it("warns when the range holds more traces than the import will take", async () => {
      const { adapter } = stubTransport([
        { data: [{ id: "o1", traceId: "t1" }] },
        { data: [], meta: { totalItems: CONFIG.maxTraces + 1 } },
        { data: [] },
      ])

      const preview = await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "lf-project",
          config: CONFIG,
          range: RANGE,
          maxRecords: 5_000,
        }),
      )

      expect(preview.warnings[0]).toContain("will not be imported")
    })

    it("folds a trace's observations into one row with its models and duration", async () => {
      const { adapter } = stubTransport([
        {
          data: [
            {
              id: "o1",
              traceId: "t1",
              name: "agent-run",
              startTime: "2026-01-05T10:00:00.000Z",
              endTime: "2026-01-05T10:00:01.000Z",
            },
            {
              id: "o2",
              traceId: "t1",
              model: "gpt-4o-mini",
              startTime: "2026-01-05T10:00:01.000Z",
              endTime: "2026-01-05T10:00:03.000Z",
            },
          ],
        },
        { data: [], meta: { totalItems: 1 } },
      ])

      const preview = await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "lf-project",
          config: CONFIG,
          range: RANGE,
          maxRecords: 5_000,
        }),
      )

      expect(preview.sample).toEqual([
        {
          traceId: "t1",
          name: "agent-run",
          models: ["gpt-4o-mini"],
          startTime: "2026-01-05T10:00:00.000Z",
          durationNs: 3_000_000_000,
        },
      ])
    })

    it("caps the sampled request at the preview sample limit", async () => {
      const { adapter, requestedUrls } = stubTransport([{ data: [] }])

      await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "lf-project",
          config: CONFIG,
          range: RANGE,
          maxRecords: 5_000,
        }),
      )

      expect(new URL(requestedUrls[0] ?? "").searchParams.get("limit")).toBe("100")
    })
  })

  describe("normalize", () => {
    // `providedModelName` exists in neither API version; the field is `model` in both. Reading
    // the wrong name gave every imported span an empty model.
    it("reads the model from the field Langfuse actually returns", () => {
      const result = createLangfuseAdapter().normalize(
        { id: "o1", traceId: "t1", type: "GENERATION", model: "gpt-4o-mini" },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.model).toBe("gpt-4o-mini")
    })

    it.each([
      ["GENERATION", "chat"],
      ["SPAN", "chain"],
      ["EVENT", "unspecified"],
      ["SOMETHING_NEW", "unspecified"],
    ])("maps observation type %s onto the %s operation", (type, operation) => {
      const result = createLangfuseAdapter().normalize({ id: "o1", traceId: "t1", type }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.operation).toBe(operation)
    })

    // v2's `trace_context` projection populated for one trace in twelve against a live
    // account, so the trace list is joined in and wins.
    it("prefers the joined trace context over the observation projection", () => {
      const result = createLangfuseAdapter().normalize(
        {
          id: "o1",
          traceId: "t1",
          sessionId: "",
          userId: "",
          tags: [],
          traceContext: { sessionId: "sess-a", userId: "user-a", tags: ["prod"] },
        },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.sessionId).toBe("sess-a")
      expect(result.span.userId).toBe("user-a")
      expect(result.span.tags).toEqual(["prod"])
    })

    const observation = {
      id: "obs-1",
      traceId: "trace-1",
      parentObservationId: "obs-parent",
      type: "GENERATION",
      name: "chat completion",
      sessionId: "session-1",
      userId: "user-1",
      startTime: "2026-01-05T10:00:00.000Z",
      endTime: "2026-01-05T10:00:02.000Z",
      input: "hello",
      output: "hi",
      metadata: { tenant: "acme", nested: { a: 1 } },
      tags: ["prod"],
      usageDetails: { input: 11, output: 7 },
      model: "gpt-4o-mini",
      promptName: "greeting",
      promptVersion: 3,
      level: "DEFAULT",
    }

    it("maps identity, timing, usage and model fields", () => {
      const result = createLangfuseAdapter().normalize(observation, CONTEXT, CONFIG)

      expect(result.status).toBe("ok")
      if (result.status !== "ok") return
      expect(result.span).toMatchObject({
        organizationId: CONTEXT.organizationId,
        projectId: CONTEXT.projectId,
        sessionId: "session-1",
        userId: "user-1",
        name: "chat completion",
        operation: "chat",
        model: "gpt-4o-mini",
        tags: ["prod"],
        tokensInput: 11,
        tokensOutput: 7,
        startTime: new Date("2026-01-05T10:00:00.000Z"),
        endTime: new Date("2026-01-05T10:00:02.000Z"),
        retentionDays: 30,
      })
      expect(result.span.traceId).toMatch(/^[0-9a-f]{32}$/)
      expect(result.span.spanId).toMatch(/^[0-9a-f]{16}$/)
      expect(result.span.parentSpanId).toMatch(/^[0-9a-f]{16}$/)
    })

    it("carries import provenance and prompt references into metadata", () => {
      const result = createLangfuseAdapter().normalize(observation, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.metadata).toMatchObject({
        "import.job_id": CONTEXT.importJobId,
        "import.source": "langfuse",
        "import.source_project_id": "lf-project",
        "import.source_trace_id": "trace-1",
        "import.source_span_id": "obs-1",
        "import.prompt_name": "greeting",
        "import.prompt_version": "3",
        tenant: "acme",
        nested: '{"a":1}',
      })
    })

    it("marks an ERROR level observation as an errored span", () => {
      const result = createLangfuseAdapter().normalize(
        { ...observation, level: "ERROR", statusMessage: "boom" },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.statusCode).toBe("error")
      expect(result.span.statusMessage).toBe("boom")
      // Empty, not a literal "error": Langfuse has no exception class to report, and inventing one
      // collapses every distinct failure into a single group in the errored-span breakdown. Live
      // ingest leaves it empty for the same reason.
      expect(result.span.errorType).toBe("")
    })

    it("reads a real exception class out of metadata when the source recorded one", () => {
      const result = createLangfuseAdapter().normalize(
        { ...observation, level: "ERROR", metadata: { "attributes.error.type": "RateLimitError" } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.errorType).toBe("RateLimitError")
    })

    it("leaves parentSpanId empty for a root observation", () => {
      const result = createLangfuseAdapter().normalize({ ...observation, parentObservationId: null }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.parentSpanId).toBe("")
    })

    it("falls back to ingestedAt when the source has no timestamps", () => {
      const result = createLangfuseAdapter().normalize({ id: "obs-2", traceId: "trace-2" }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.startTime).toEqual(CONTEXT.ingestedAt)
      expect(result.span.endTime).toEqual(CONTEXT.ingestedAt)
    })

    it.each([
      ["missing id", { traceId: "trace-1" }],
      ["missing traceId", { id: "obs-1" }],
      ["both missing", {}],
    ])("skips a row with %s", (_label, row) => {
      const result = createLangfuseAdapter().normalize(row, CONTEXT, CONFIG)

      expect(result).toEqual({ status: "skip", reason: "missing ids" })
    })

    // Langfuse prices the call itself, so its figure beats anything we could estimate.
    it("takes cost from costDetails rather than estimating it", () => {
      const result = createLangfuseAdapter().normalize(
        { ...observation, costDetails: { input: 0.0004, output: 0.0006, total: 0.001 } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.costIsEstimated).toBe(false)
      expect(result.span.costInputMicrocents).toBe(40_000)
      expect(result.span.costOutputMicrocents).toBe(60_000)
      expect(result.span.costTotalMicrocents).toBe(100_000)
    })

    it("prices the span from models.dev when the caller recorded a provider and Langfuse did not price it", () => {
      const result = createLangfuseAdapter().normalize(
        { ...observation, metadata: { provider: "openai" } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.provider).toBe("openai")
      expect(result.span.costIsEstimated).toBe(true)
      expect(result.span.costTotalMicrocents).toBeGreaterThan(0)
    })

    it("translates the observation's input and output into messages", () => {
      const result = createLangfuseAdapter().normalize(
        {
          ...observation,
          input: [{ role: "user", content: "What is 2+2?" }],
          output: { role: "assistant", content: "4" },
        },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "What is 2+2?" }] }])
      expect(result.span.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "4" }] }])
    })

    it("derives time to first token from completionStartTime", () => {
      const result = createLangfuseAdapter().normalize(
        { ...observation, completionStartTime: "2026-01-05T10:00:00.400Z" },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.timeToFirstTokenNs).toBe(400_000_000)
      expect(result.span.isStreaming).toBe(true)
    })

    // `model` is the observed key; `providedModelName` is what the v2 `model` field group
    // documents. Reading only one of them would make the docs or the observation a single
    // point of failure for an empty model column.
    it("falls back to providedModelName when model is absent", () => {
      const result = createLangfuseAdapter().normalize(
        { id: "o1", traceId: "t1", type: "GENERATION", providedModelName: "gpt-4o" },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.model).toBe("gpt-4o")
    })

    it("prefers the usage group's own cost split over costDetails", () => {
      const result = createLangfuseAdapter().normalize(
        { ...observation, inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, costDetails: { total: 99 } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.costTotalMicrocents).toBe(300_000)
    })

    it("keeps model parameters, prompt id, environment and version as metadata", () => {
      const result = createLangfuseAdapter().normalize(
        {
          ...observation,
          modelParameters: { temperature: 0.2, stream: true },
          promptId: "prompt-abc",
          environment: "staging",
          version: "1.4.0",
        },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.metadata).toMatchObject({
        temperature: "0.2",
        "import.prompt_id": "prompt-abc",
        "import.environment": "staging",
        "import.version": "1.4.0",
      })
      expect(result.span.isStreaming).toBe(true)
    })

    it("records the tool a TOOL observation ran", () => {
      const result = createLangfuseAdapter().normalize(
        { ...observation, type: "TOOL", name: "get_weather", input: { city: "SF" }, output: { tempC: 21 } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.operation).toBe("execute_tool")
      expect(result.span.toolName).toBe("get_weather")
      expect(result.span.toolInput).toBe('{"city":"SF"}')
      expect(result.span.toolOutput).toBe('{"tempC":21}')
    })
  })
})
