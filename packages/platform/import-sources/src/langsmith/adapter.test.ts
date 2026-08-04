import type { ImportConfig, NormalizeContext } from "@domain/imports"
import { OrganizationId, ProjectId } from "@domain/shared"
import { Effect, Exit } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createLangsmithAdapter } from "./adapter.ts"

const CREDENTIALS = { kind: "langsmith" as const, region: "gcp-us" as const, apiKey: "lsv2_pt_test" }

const CONFIG: ImportConfig = {
  sourceProjectId: "ls-session-id",
  sourceProjectName: "LS Project",
  sourceRegion: "gcp-us",
  sourceBaseUrl: "https://api.smith.langchain.com",
  rangeFrom: new Date("2026-01-01T00:00:00Z"),
  rangeTo: new Date("2026-02-01T00:00:00Z"),
  maxTraces: 1_000,
  sourcePageSize: 1_000,
}

const CONTEXT: NormalizeContext = {
  organizationId: OrganizationId("org1234567890123456789012"),
  projectId: ProjectId("prj1234567890123456789012"),
  importJobId: "job1234567890123456789012",
  source: "langsmith",
  sourceProjectId: "ls-session-id",
  ingestedAt: new Date("2026-03-01T00:00:00Z"),
  retentionDays: 30,
}

const RANGE = { from: CONFIG.rangeFrom, to: CONFIG.rangeTo }

interface CapturedRequest {
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: Record<string, unknown>
}

const stubTransport = (body: unknown) => {
  const requests: CapturedRequest[] = []
  const fetchImpl = vi.fn(async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
    requests.push({
      url: String(url),
      headers: init?.headers ?? {},
      body: init?.body ? JSON.parse(init.body) : {},
    })
    return new Response(JSON.stringify(body), { status: 200 })
  })
  vi.stubGlobal("fetch", fetchImpl)
  return { requests, adapter: createLangsmithAdapter() }
}

const run = (rows: readonly unknown[] = [], cursors: { readonly next: string | null } = { next: "next-page" }) =>
  stubTransport({ runs: rows, cursors })

const fetchPage = (
  adapter: ReturnType<typeof createLangsmithAdapter>,
  cursor: { readonly cursor: string } | null,
  limit: number,
) =>
  adapter.fetchPage({
    credentials: CREDENTIALS,
    sourceProjectId: "ls-session-id",
    config: CONFIG,
    cursor,
    range: RANGE,
    limit,
  })

describe("LangSmith adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("authentication", () => {
    it("sends the api key", async () => {
      const { adapter, requests } = run()

      await Effect.runPromise(adapter.testConnection({ credentials: CREDENTIALS }))

      expect(requests[0]?.headers["x-api-key"]).toBe("lsv2_pt_test")
    })

    it("scopes the request to a workspace when one is configured", async () => {
      const { adapter, requests } = stubTransport([])

      await Effect.runPromise(
        adapter.listProjects({ credentials: { ...CREDENTIALS, workspaceId: "ws-42" }, limit: 10 }),
      )

      // Collecting a workspace id and never sending it silently imported the wrong tenant.
      expect(requests[0]?.headers["x-tenant-id"]).toBe("ws-42")
    })

    it("omits the tenant header entirely when no workspace is configured", async () => {
      const { adapter, requests } = stubTransport([])

      await Effect.runPromise(adapter.listProjects({ credentials: CREDENTIALS, limit: 10 }))

      expect(requests[0]?.headers).not.toHaveProperty("x-tenant-id")
    })

    it("rejects credentials belonging to another source", async () => {
      const { adapter } = run()

      await expect(
        Effect.runPromise(adapter.testConnection({ credentials: { kind: "braintrust", region: "us", apiKey: "bt" } })),
      ).rejects.toMatchObject({ category: "config", retryable: false })
    })
  })

  describe("fetchPage", () => {
    it("sends the selected time range in the query body", async () => {
      const { adapter, requests } = run()

      await Effect.runPromise(
        adapter.fetchPage({
          credentials: CREDENTIALS,
          sourceProjectId: "ls-session-id",
          config: CONFIG,
          cursor: null,
          range: RANGE,
          limit: 100,
        }),
      )

      // Sending the window only as a query string left the API filtering nothing.
      expect(requests[0]?.body).toMatchObject({
        session: ["ls-session-id"],
        start_time: CONFIG.rangeFrom.toISOString(),
        end_time: CONFIG.rangeTo.toISOString(),
        limit: 100,
      })
    })

    it("asks for runs newest first, so a capped import keeps recent history", async () => {
      const { adapter, requests } = run()

      await Effect.runPromise(fetchPage(adapter, null, 10))

      expect(requests[0]?.body).toMatchObject({ order: "desc" })
    })

    it("follows the continuation cursor the API returns", async () => {
      const { adapter } = run([{ id: "r1" }, { id: "r2" }], { next: "cursor-token-2" })

      const page = await Effect.runPromise(fetchPage(adapter, { cursor: "cursor-token-1" }, 2))

      expect(page.hasMore).toBe(true)
      expect(page.nextCursor).toEqual({ cursor: "cursor-token-2" })
    })

    it("sends the cursor back on the next request", async () => {
      const { adapter, requests } = run([], { next: null })

      await Effect.runPromise(fetchPage(adapter, { cursor: "cursor-token-1" }, 10))

      expect(requests[0]?.body).toMatchObject({ cursor: "cursor-token-1" })
    })

    it("omits the cursor entirely on the first request", async () => {
      const { adapter, requests } = run()

      await Effect.runPromise(fetchPage(adapter, null, 10))

      expect(requests[0]?.body).not.toHaveProperty("cursor")
    })

    it("stops when the API returns no further cursor", async () => {
      const { adapter } = run([{ id: "r1" }], { next: null })

      const page = await Effect.runPromise(fetchPage(adapter, null, 10))

      expect(page.hasMore).toBe(false)
      expect(page.nextCursor).toBeNull()
    })

    it("fails rather than silently dropping the rest of a full page with no cursor", async () => {
      const { adapter } = run([{ id: "r1" }, { id: "r2" }], { next: null })

      const exit = await Effect.runPromiseExit(fetchPage(adapter, null, 2))

      expect(Exit.isFailure(exit)).toBe(true)
      expect(JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)).toContain("without a pagination cursor")
    })

    it("clamps the page size to the 100 the endpoint accepts", async () => {
      const { adapter, requests } = run()

      // `/runs/query` declares `limit` as `maximum: 100`, so the configured page size of
      // 1_000 would be rejected outright rather than trimmed.
      await Effect.runPromise(fetchPage(adapter, null, CONFIG.sourcePageSize))

      expect(requests[0]?.body).toMatchObject({ limit: 100 })
    })

    it("guards a full page against the clamped size, not the size that was asked for", async () => {
      const { adapter } = run(
        Array.from({ length: 100 }, (_, i) => ({ id: `r${i}` })),
        { next: null },
      )

      const exit = await Effect.runPromiseExit(fetchPage(adapter, null, CONFIG.sourcePageSize))

      expect(JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)).toContain("without a pagination cursor")
    })

    it("maps a 429 to a retryable rate-limit error carrying Retry-After", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } })),
      )

      await expect(
        Effect.runPromise(
          createLangsmithAdapter().fetchPage({
            credentials: CREDENTIALS,
            sourceProjectId: "ls-session-id",
            config: CONFIG,
            cursor: null,
            range: RANGE,
            limit: 10,
          }),
        ),
      ).rejects.toMatchObject({ category: "rate_limited", retryable: true, retryAfterMs: 12_000 })
    })
  })

  describe("preview", () => {
    it("sends the time range in the query body", async () => {
      const { adapter, requests } = run([{ id: "r1", trace_id: "t1" }])

      await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "ls-session-id",
          config: CONFIG,
          range: RANGE,
          maxRecords: 5_000,
        }),
      )

      expect(requests[0]?.body).toMatchObject({
        start_time: CONFIG.rangeFrom.toISOString(),
        end_time: CONFIG.rangeTo.toISOString(),
        limit: 100,
      })
    })

    it("always explains that session_id is the project id", async () => {
      const { adapter } = run([{ id: "r1", extra: { metadata: { thread_id: "th-1" } } }])

      const preview = await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "ls-session-id",
          config: CONFIG,
          range: RANGE,
          maxRecords: 100,
        }),
      )

      expect(preview.warnings[0]).toContain("session_id` is the project id")
      expect(preview.warnings[0]).toContain("extra.metadata.thread_id")
    })

    it("warns when no sampled run carries the session metadata key", async () => {
      const { adapter } = run([
        { id: "r1", trace_id: "t1" },
        { id: "r2", trace_id: "t2" },
      ])

      const preview = await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "ls-session-id",
          config: CONFIG,
          range: RANGE,
          maxRecords: 100,
        }),
      )

      expect(preview.warnings.some((w) => w.includes("each trace will import as its own session"))).toBe(true)
    })

    it("does not warn about sessions when the key resolves", async () => {
      const { adapter } = run([{ id: "r1", trace_id: "t1", extra: { metadata: { thread_id: "th-1" } } }])

      const preview = await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "ls-session-id",
          config: CONFIG,
          range: RANGE,
          maxRecords: 100,
        }),
      )

      expect(preview.warnings.some((w) => w.includes("its own session"))).toBe(false)
    })

    it("names the user's configured key in the warning", async () => {
      const { adapter } = run([{ id: "r1", trace_id: "t1" }])

      const preview = await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "ls-session-id",
          config: { ...CONFIG, sessionMetadataKey: "conversation_ref" },
          range: RANGE,
          maxRecords: 100,
        }),
      )

      expect(preview.warnings[0]).toContain("extra.metadata.conversation_ref")
    })
  })

  describe("listProjects", () => {
    it("maps sessions to source projects, preferring name over session_name", async () => {
      stubTransport([{ id: "s1", name: "Prod" }, { id: "s2", session_name: "Staging" }, { id: "s3" }])

      const result = await Effect.runPromise(
        createLangsmithAdapter().listProjects({ credentials: CREDENTIALS, limit: 10 }),
      )

      expect(result.projects).toEqual([
        { id: "s1", name: "Prod" },
        { id: "s2", name: "Staging" },
        { id: "s3", name: "s3" },
      ])
      expect(result.nextCursor).toBeNull()
    })

    it("fails cleanly when the session list is not an array", async () => {
      stubTransport({ detail: "unauthorized" })

      await expect(
        Effect.runPromise(createLangsmithAdapter().listProjects({ credentials: CREDENTIALS, limit: 10 })),
      ).rejects.toMatchObject({ category: "mapping", retryable: false })
    })
  })

  describe("normalize", () => {
    // LangSmith sends `2026-01-05T10:00:00.000000` with no designator. `new Date` reads a bare
    // date-time as local time, so this shifted every imported span by the worker's UTC offset —
    // invisible on a UTC host, hours out anywhere else, and different across a DST boundary.
    it("reads timezone-naive timestamps as UTC", () => {
      const result = createLangsmithAdapter().normalize(
        { id: "run-1", start_time: "2026-01-05T10:00:00.000000", end_time: "2026-01-05T10:00:02.000000" },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.startTime.toISOString()).toBe("2026-01-05T10:00:00.000Z")
      expect(result.span.endTime.toISOString()).toBe("2026-01-05T10:00:02.000Z")
    })

    // LangSmith's OTLP receiver JSON-encodes an OTEL tool result into OpenAI's string `content`, so
    // a result that was already a string arrives quoted with its newlines escaped.
    it.each([
      ["a doubly-encoded string", '"order NW-9999 not found\\n\\nTry again."', "order NW-9999 not found\n\nTry again."],
      ["a json object result", '{"order_id":"NW-4821"}', '{"order_id":"NW-4821"}'],
      ["plain text", "order NW-9999 not found", "order NW-9999 not found"],
    ])("unwraps %s correctly", (_label, content, expected) => {
      const result = createLangsmithAdapter().normalize(
        {
          id: "run-1",
          run_type: "llm",
          inputs: {
            messages: [
              { role: "user", content: "q" },
              {
                role: "assistant",
                tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }],
              },
              { role: "tool", tool_call_id: "c1", name: "t", content },
            ],
          },
        },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      const part = result.span.inputMessages.flatMap((m) => m.parts ?? []).find((p) => p.type === "tool_call_response")
      expect(part?.response).toBe(expected)
    })

    it("keeps an explicit offset when the timestamp carries one", () => {
      const result = createLangsmithAdapter().normalize(
        { id: "run-1", start_time: "2026-01-05T12:00:00+02:00" },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.startTime.toISOString()).toBe("2026-01-05T10:00:00.000Z")
    })

    // The trace rollup gates tokens and the conversation view on Latitude's own operation
    // names, so a vendor string passed through reads back as a trace with neither.
    it.each([
      ["llm", "chat"],
      ["chain", "chain"],
      ["tool", "execute_tool"],
      ["retriever", "retrieval"],
      ["something_new", "unspecified"],
    ])("maps run_type %s onto the %s operation", (runType, operation) => {
      const result = createLangsmithAdapter().normalize({ id: "run-1", run_type: runType }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.operation).toBe(operation)
    })

    // A user id is not a conversation id. With it in the chain, every trace of one user
    // collapsed into a single session whenever no thread key was present.
    it("does not fall back to user_id for the session", () => {
      const result = createLangsmithAdapter().normalize(
        { id: "run-1", trace_id: "trace-1", extra: { metadata: { user_id: "user-a" } } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.sessionId).toBe("")
      expect(result.span.userId).toBe("user-a")
    })

    const runRow = {
      id: "11111111-2222-4333-8444-555555555555",
      trace_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      parent_run_id: "99999999-8888-4777-8666-555555555555",
      name: "llm call",
      run_type: "llm",
      session_id: "ls-session-id",
      start_time: "2026-01-05T10:00:00.000Z",
      end_time: "2026-01-05T10:00:03.000Z",
      inputs: { messages: [{ role: "user", content: "hi" }] },
      outputs: { role: "assistant", content: "hello" },
      tags: ["beta"],
      extra: { metadata: { thread_id: "thread-9", user_id: "u-1", ls_model_name: "gpt-4o" } },
      prompt_tokens: 13,
      completion_tokens: 4,
    }

    it("resolves the session from metadata rather than the project id", () => {
      const result = createLangsmithAdapter().normalize(runRow, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.sessionId).toBe("thread-9")
      expect(result.span.sessionId).not.toBe("ls-session-id")
    })

    it("prefers the user's configured session key over the defaults", () => {
      const result = createLangsmithAdapter().normalize(
        { ...runRow, extra: { metadata: { thread_id: "thread-9", my_key: "chosen" } } },
        CONTEXT,
        { ...CONFIG, sessionMetadataKey: "my_key" },
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.sessionId).toBe("chosen")
    })

    it("falls back through the default keys in order", () => {
      const result = createLangsmithAdapter().normalize(
        { ...runRow, extra: { metadata: { conversation_id: "conv-3" } } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.sessionId).toBe("conv-3")
    })

    // Empty rather than the trace id: the rollup coalesces an empty session to the trace anyway,
    // so a synthetic id only makes a standalone trace indistinguishable from a real conversation.
    it("reports no session when no metadata key is present", () => {
      const result = createLangsmithAdapter().normalize({ ...runRow, extra: {} }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.sessionId).toBe("")
    })

    it("maps run identity, model, tokens and tags", () => {
      const result = createLangsmithAdapter().normalize(runRow, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span).toMatchObject({
        userId: "u-1",
        name: "llm call",
        operation: "chat",
        model: "gpt-4o",
        tags: ["beta"],
        tokensInput: 13,
        tokensOutput: 4,
      })
      expect(result.span.traceId).toMatch(/^[0-9a-f]{32}$/)
      expect(result.span.spanId).toMatch(/^[0-9a-f]{16}$/)
      expect(result.span.parentSpanId).toMatch(/^[0-9a-f]{16}$/)
    })

    it("maps LangChain message payloads into GenAI messages", () => {
      const result = createLangsmithAdapter().normalize(runRow, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hi" }] }])
      expect(result.span.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "hello" }] }])
    })

    it("marks an errored run", () => {
      const result = createLangsmithAdapter().normalize(
        { ...runRow, status: "error", error: "traceback" },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.statusCode).toBe("error")
      expect(result.span.statusMessage).toBe("traceback")
    })

    it("treats a run with no trace_id as its own trace root", () => {
      const result = createLangsmithAdapter().normalize({ id: runRow.id, parent_run_id: null }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.metadata["import.source_trace_id"]).toBe(runRow.id)
      expect(result.span.parentSpanId).toBe("")
    })

    it("skips a row with no id", () => {
      expect(createLangsmithAdapter().normalize({ trace_id: "t" }, CONTEXT, CONFIG)).toEqual({
        status: "skip",
        reason: "missing id",
      })
    })

    // `ls_provider` is LangChain's own run metadata, the same place `ls_model_name` comes from.
    it("prices the run from models.dev using the provider LangChain recorded", () => {
      const result = createLangsmithAdapter().normalize(
        { ...runRow, extra: { metadata: { ...runRow.extra.metadata, ls_provider: "openai" } } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.provider).toBe("openai")
      expect(result.span.costIsEstimated).toBe(true)
      expect(result.span.costTotalMicrocents).toBeGreaterThan(0)
    })

    it("prefers the cost LangSmith computed over an estimate", () => {
      const result = createLangsmithAdapter().normalize(
        {
          ...runRow,
          extra: { metadata: { ...runRow.extra.metadata, ls_provider: "openai" } },
          prompt_cost: 0.0004,
          completion_cost: 0.0006,
          total_cost: 0.001,
        },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.costIsEstimated).toBe(false)
      expect(result.span.costTotalMicrocents).toBe(100_000)
    })

    it("translates the run's inputs and outputs into messages", () => {
      const result = createLangsmithAdapter().normalize(runRow, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hi" }] }])
      expect(result.span.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "hello" }] }])
    })

    it("derives time to first token from first_token_time, parsed as UTC", () => {
      const result = createLangsmithAdapter().normalize(
        { ...runRow, start_time: "2026-01-05T10:00:00.000000", first_token_time: "2026-01-05T10:00:00.350000" },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.timeToFirstTokenNs).toBe(350_000_000)
      expect(result.span.isStreaming).toBe(true)
    })

    it("keeps the run's streaming events", () => {
      const events = [{ name: "new_token", time: "2026-01-05T10:00:00.350000" }]
      const result = createLangsmithAdapter().normalize({ ...runRow, events }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.eventsJson).toBe(JSON.stringify(events))
    })

    // `runtime.library` is the instrumentation that produced the run, the same slot `langchain`
    // would occupy on a span arriving over OTLP.
    it("maps the runtime library onto the instrumentation scope", () => {
      const result = createLangsmithAdapter().normalize(
        { ...runRow, extra: { ...runRow.extra, runtime: { library: "langchain", library_version: "0.3.1" } } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.scopeName).toBe("langchain")
      expect(result.span.scopeVersion).toBe("0.3.1")
    })

    it("falls back to the invocation params for the model when ls_model_name is absent", () => {
      const result = createLangsmithAdapter().normalize(
        { ...runRow, extra: { metadata: {}, invocation_params: { model: "gpt-4o-mini" } } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.model).toBe("gpt-4o-mini")
    })

    // LangSmith declares tools on the call's arguments, not inside `inputs`, so reading only the
    // input payload would find none.
    it("reads tool definitions from the invocation params", () => {
      const result = createLangsmithAdapter().normalize(
        {
          ...runRow,
          extra: {
            ...runRow.extra,
            invocation_params: {
              tools: [{ type: "function", function: { name: "get_weather", description: "Look it up" } }],
            },
          },
        },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.toolNames).toEqual(["get_weather"])
    })

    it("reads finish reasons out of the nested LLMResult generations", () => {
      const result = createLangsmithAdapter().normalize(
        {
          ...runRow,
          outputs: {
            generations: [[{ text: "hi", generation_info: { finish_reason: "stop" } }]],
          },
        },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.finishReasons).toEqual(["stop"])
    })

    it("leaves finish reasons empty when the outputs carry none", () => {
      const result = createLangsmithAdapter().normalize(runRow, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.finishReasons).toEqual([])
    })

    it("records the tool a tool run ran", () => {
      const result = createLangsmithAdapter().normalize(
        { ...runRow, run_type: "tool", name: "get_weather", inputs: { city: "SF" }, outputs: { tempC: 21 } },
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
