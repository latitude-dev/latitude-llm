import type { ImportConfig, NormalizeContext } from "@domain/imports"
import { OrganizationId, ProjectId } from "@domain/shared"
import { Effect, Exit } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createBraintrustAdapter } from "./adapter.ts"

const CREDENTIALS = { kind: "braintrust" as const, region: "us" as const, apiKey: "bt-test" }

const CONFIG: ImportConfig = {
  sourceProjectId: "bt-project",
  sourceProjectName: "BT Project",
  sourceRegion: "us",
  sourceBaseUrl: "https://api.braintrust.dev",
  rangeFrom: new Date("2026-01-01T00:00:00Z"),
  rangeTo: new Date("2026-02-01T00:00:00Z"),
  maxTraces: 1_000,
  sourcePageSize: 1_000,
}

const CONTEXT: NormalizeContext = {
  organizationId: OrganizationId("org1234567890123456789012"),
  projectId: ProjectId("prj1234567890123456789012"),
  importJobId: "job1234567890123456789012",
  source: "braintrust",
  sourceProjectId: "bt-project",
  ingestedAt: new Date("2026-03-01T00:00:00Z"),
  retentionDays: 30,
}

const RANGE = { from: CONFIG.rangeFrom, to: CONFIG.rangeTo }

const stubTransport = (body: unknown) => {
  const queries: string[] = []
  const fetchImpl = vi.fn(async (_url: string, init?: { body?: string }) => {
    if (init?.body) queries.push(String((JSON.parse(init.body) as { query?: string }).query))
    return new Response(JSON.stringify(body), { status: 200 })
  })
  vi.stubGlobal("fetch", fetchImpl)
  return { queries, fetchImpl, adapter: createBraintrustAdapter() }
}

const fetchPage = (adapter: ReturnType<typeof createBraintrustAdapter>, sourceProjectId: string, limit = 100) =>
  adapter.fetchPage({
    credentials: CREDENTIALS,
    sourceProjectId,
    config: CONFIG,
    cursor: null,
    range: RANGE,
    limit,
  })

const pageWithCursor = (
  adapter: ReturnType<typeof createBraintrustAdapter>,
  cursor: { readonly cursor: string },
  limit: number,
) =>
  adapter.fetchPage({
    credentials: CREDENTIALS,
    sourceProjectId: "bt-project",
    config: CONFIG,
    cursor,
    range: RANGE,
    limit,
  })

describe("Braintrust adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("BTQL project id handling", () => {
    it("builds a bounded query for a well-formed project id", async () => {
      const { adapter, queries } = stubTransport({ data: [] })

      await Effect.runPromise(fetchPage(adapter, "proj_abc-123", 250))

      expect(queries[0]).toBe(
        `select * from project_logs('proj_abc-123', shape => 'spans') where created >= '${CONFIG.rangeFrom.toISOString()}'` +
          ` and created <= '${CONFIG.rangeTo.toISOString()}' order by created desc limit 250`,
      )
    })

    // `traces` widens a page to whole traces and `summary` drops `span_id` entirely, so an
    // unpinned shape would change what a page holds depending on Braintrust's own default.
    it("pins the row shape to spans on every query it sends", async () => {
      const { adapter, queries } = stubTransport({ data: [] })

      await Effect.runPromise(fetchPage(adapter, "proj_abc-123", 250))
      await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "proj_abc-123",
          config: CONFIG,
          range: RANGE,
          maxRecords: 100,
        }),
      )

      // fetchPage, then the preview's sample and its trace count.
      expect(queries).toHaveLength(3)
      for (const query of queries) {
        expect(query).toContain("shape => 'spans'")
      }
    })

    it.each([
      ["a quote escape", "abc') where 1=1 --"],
      ["a statement terminator", "abc'; drop table x; --"],
      ["a nested call", "abc') union select * from project_logs('other"],
      ["whitespace", "abc def"],
      ["an empty id", ""],
      ["an over-long id", "a".repeat(129)],
    ])("refuses %s instead of concatenating it into the query", async (_label, sourceProjectId) => {
      const { adapter, fetchImpl } = stubTransport({ data: [] })

      await expect(Effect.runPromise(fetchPage(adapter, sourceProjectId))).rejects.toMatchObject({
        category: "config",
        retryable: false,
      })
      // BTQL has no parameter binding, so rejection has to happen before the request.
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it("refuses an unsafe project id on the preview path too", async () => {
      const { adapter, fetchImpl } = stubTransport({ data: [] })

      await expect(
        Effect.runPromise(
          adapter.preview({
            credentials: CREDENTIALS,
            sourceProjectId: "abc') where 1=1 --",
            config: CONFIG,
            range: RANGE,
            maxRecords: 100,
          }),
        ),
      ).rejects.toMatchObject({ category: "config" })
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it("accepts the id shapes Braintrust actually issues", async () => {
      for (const id of ["9f8e7d6c-5b4a-4321-8fed-cba987654321", "proj_ABC123", "my-project_1"]) {
        const { adapter } = stubTransport({ data: [] })
        await expect(Effect.runPromise(fetchPage(adapter, id))).resolves.toBeDefined()
      }
    })
  })

  describe("fetchPage", () => {
    it("follows the continuation cursor the API returns", async () => {
      const { adapter } = stubTransport({ data: [{ span_id: "s1" }, { span_id: "s2" }], cursor: "token-2" })

      const page = await Effect.runPromise(pageWithCursor(adapter, { cursor: "token-1" }, 2))

      expect(page.hasMore).toBe(true)
      expect(page.nextCursor).toEqual({ cursor: "token-2" })
    })

    it("stops when the API returns no further cursor", async () => {
      const { adapter } = stubTransport({ data: [{ span_id: "s1" }] })

      const page = await Effect.runPromise(fetchPage(adapter, "bt-project", 10))

      expect(page.hasMore).toBe(false)
      expect(page.nextCursor).toBeNull()
    })

    it("carries the cursor into the query as a quoted offset token", async () => {
      const { adapter, queries } = stubTransport({ data: [] })

      await Effect.runPromise(pageWithCursor(adapter, { cursor: "token-1" }, 20))

      expect(queries[0]).toContain("limit 20 offset 'token-1'")
    })

    it("refuses a cursor that could break out of the query literal", async () => {
      const { adapter } = stubTransport({ data: [] })

      const exit = await Effect.runPromiseExit(pageWithCursor(adapter, { cursor: "tok' or 1=1 --" }, 20))

      expect(Exit.isFailure(exit)).toBe(true)
      expect(JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)).toContain("unexpected characters")
    })

    it("fails rather than silently dropping the rest of a full page with no cursor", async () => {
      const { adapter } = stubTransport({ data: [{ span_id: "s1" }, { span_id: "s2" }] })

      const exit = await Effect.runPromiseExit(fetchPage(adapter, "bt-project", 2))

      expect(Exit.isFailure(exit)).toBe(true)
      expect(JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)).toContain("without a pagination cursor")
    })

    it("clamps a page size above the provider ceiling, and guards against the clamped size", async () => {
      const { adapter, queries } = stubTransport({
        data: Array.from({ length: 1_000 }, (_, i) => ({ span_id: `s${i}` })),
      })

      // Asking for the config maximum but comparing against the requested 5_000 would read a
      // server-capped page as a complete window and walk past the rest of it.
      const exit = await Effect.runPromiseExit(fetchPage(adapter, "bt-project", 5_000))

      expect(queries[0]).toContain("limit 1000")
      expect(JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)).toContain("without a pagination cursor")
    })

    it("maps a 500 to a retryable server error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("{}", { status: 500 })),
      )

      await expect(Effect.runPromise(fetchPage(createBraintrustAdapter(), "bt-project"))).rejects.toMatchObject({
        category: "server_error",
        retryable: true,
        upstreamStatus: 500,
      })
    })

    it("rejects credentials belonging to another source", async () => {
      const { adapter } = stubTransport({ data: [] })

      await expect(
        Effect.runPromise(
          adapter.fetchPage({
            credentials: { kind: "langsmith", region: "gcp-us", apiKey: "ls" },
            sourceProjectId: "bt-project",
            config: CONFIG,
            cursor: null,
            range: RANGE,
            limit: 10,
          }),
        ),
      ).rejects.toMatchObject({ category: "config", retryable: false })
    })
  })

  // Braintrust pulls inline binary out of a span, uploads it, and leaves a reference behind — and
  // drops the source attribute for that side too, so nothing an import reads holds the bytes. A
  // reference cannot be opened from Latitude, so an image that is not fetched here is an image the
  // conversation never shows.
  describe("attachments", () => {
    const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])
    const PNG_BASE64 = Buffer.from(PNG).toString("base64")

    const descriptor = {
      type: "braintrust_attachment",
      content_type: "image/png",
      filename: "file.png",
      key: "abc-123",
    }

    const rowWithAttachment = (key = "abc-123") => ({
      span_id: "s1",
      org_id: "org-1",
      span_attributes: { type: "llm" },
      input: [
        {
          role: "user",
          content: [
            { type: "text", text: "what is this" },
            { type: "image_url", image_url: { url: { ...descriptor, key } } },
          ],
        },
      ],
    })

    const stubAttachments = (options: {
      readonly rows: readonly unknown[]
      readonly meta?: unknown
      readonly metaStatus?: number
      readonly downloadStatus?: number
    }) => {
      const urls: string[] = []
      const fetchImpl = vi.fn(async (url: string) => {
        urls.push(url)
        if (url.includes("/btql")) return new Response(JSON.stringify({ data: options.rows }), { status: 200 })
        if (url.includes("/attachment?")) {
          const meta = options.meta ?? {
            downloadUrl: "https://store.example/signed",
            contentLength: PNG.length,
            status: { upload_status: "done" },
          }
          return new Response(JSON.stringify(meta), { status: options.metaStatus ?? 200 })
        }
        return new Response(PNG, { status: options.downloadStatus ?? 200 })
      })
      vi.stubGlobal("fetch", fetchImpl)
      return { urls, adapter: createBraintrustAdapter() }
    }

    const partsOf = (row: Parameters<ReturnType<typeof createBraintrustAdapter>["normalize"]>[0]) => {
      const result = createBraintrustAdapter().normalize(row, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")
      return result.span.inputMessages.flatMap((message) => message.parts ?? [])
    }

    it("inlines the bytes so the message carries the image rather than a reference", async () => {
      const { adapter, urls } = stubAttachments({ rows: [rowWithAttachment()] })

      const page = await Effect.runPromise(fetchPage(adapter, "bt-project", 10))

      expect(urls[1]).toContain("/attachment?key=abc-123&filename=file.png&content_type=image%2Fpng&org_id=org-1")
      expect(partsOf(page.rows[0])).toEqual([
        { type: "text", content: "what is this" },
        { type: "blob", mime_type: "image/png", modality: "image", content: PNG_BASE64 },
      ])
    })

    // A payload holding a tool exchange translates by a route that keeps only a part's `type` and
    // `content`, so writing the binary part in directly arrived with no mime type and no modality.
    it("keeps the mime type when the same message also holds a tool exchange", async () => {
      const row = rowWithAttachment()
      const { adapter } = stubAttachments({
        rows: [
          {
            ...row,
            input: [
              ...row.input,
              {
                role: "assistant",
                content: null,
                tool_calls: [{ id: "c", type: "function", function: { name: "t", arguments: "{}" } }],
              },
              { role: "tool", tool_call_id: "c", content: "ok" },
            ],
          },
        ],
      })

      const page = await Effect.runPromise(fetchPage(adapter, "bt-project", 10))

      expect(partsOf(page.rows[0])).toContainEqual({
        type: "blob",
        mime_type: "image/png",
        modality: "image",
        content: PNG_BASE64,
      })
    })

    it("fetches a key once however many turns replay it", async () => {
      const { adapter, urls } = stubAttachments({
        rows: [rowWithAttachment(), { ...rowWithAttachment(), span_id: "s2" }],
      })

      await Effect.runPromise(fetchPage(adapter, "bt-project", 10))

      // The BTQL query, one metadata request, one download.
      expect(urls).toHaveLength(3)
    })

    it.each([
      [
        "one larger than the ceiling",
        {
          downloadUrl: "https://store.example/signed",
          contentLength: 8 * 1024 * 1024,
          status: { upload_status: "done" },
        },
      ],
      [
        "an upload still in progress",
        { downloadUrl: "https://store.example/signed", contentLength: 12, status: { upload_status: "uploading" } },
      ],
    ])("declines %s without transferring it", async (_label, meta) => {
      const { adapter, urls } = stubAttachments({ rows: [rowWithAttachment()], meta })

      const page = await Effect.runPromise(fetchPage(adapter, "bt-project", 10))

      expect(urls.some((url) => url.includes("store.example"))).toBe(false)
      expect(partsOf(page.rows[0])).toEqual([
        { type: "text", content: "what is this" },
        { type: "uri", modality: "image", uri: "braintrust-attachment:abc-123" },
      ])
    })

    it.each([
      ["the metadata request fails", { metaStatus: 500 }],
      ["the download fails", { downloadStatus: 404 }],
    ])("keeps the reference and the page when %s", async (_label, failure) => {
      const { adapter } = stubAttachments({ rows: [rowWithAttachment()], ...failure })

      const page = await Effect.runPromise(fetchPage(adapter, "bt-project", 10))

      expect(partsOf(page.rows[0])).toEqual([
        { type: "text", content: "what is this" },
        { type: "uri", modality: "image", uri: "braintrust-attachment:abc-123" },
      ])
    })

    it("asks for nothing when a row carries no org id to ask with", async () => {
      const { org_id: _orgId, ...row } = rowWithAttachment()
      const { adapter, urls } = stubAttachments({ rows: [row] })

      await Effect.runPromise(fetchPage(adapter, "bt-project", 10))

      expect(urls).toHaveLength(1)
    })
  })

  describe("preview", () => {
    it("counts traces with a BTQL aggregate over distinct root spans", async () => {
      const { adapter, queries } = stubTransport({ data: [{ traces: 9 }] })

      const preview = await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "bt-project",
          config: CONFIG,
          range: RANGE,
          maxRecords: 5_000,
        }),
      )

      expect(preview.estimatedTraces).toBe(9)
      expect(queries[1]).toContain("count(distinct root_span_id) as traces")
      expect(preview.warnings).toEqual([])
    })

    it("samples one span per trace rather than several of the first", async () => {
      // Every source returns spans, so an unfiltered head shows one trace several times.
      const { adapter } = stubTransport({
        data: [
          { span_id: "s1", root_span_id: "t1" },
          { span_id: "s2", root_span_id: "t1" },
          { span_id: "s3", root_span_id: "t2" },
        ],
      })

      const preview = await Effect.runPromise(
        adapter.preview({
          credentials: CREDENTIALS,
          sourceProjectId: "bt-project",
          config: CONFIG,
          range: RANGE,
          maxRecords: 5_000,
        }),
      )

      expect(preview.sample.map((row) => row.traceId)).toEqual(["t1", "t2", "t1"])
    })
  })

  describe("listProjects", () => {
    it("maps the objects envelope to source projects", async () => {
      stubTransport({
        objects: [
          { id: "p1", name: "Alpha" },
          { id: "p2", name: "Beta" },
        ],
      })

      const result = await Effect.runPromise(
        createBraintrustAdapter().listProjects({ credentials: CREDENTIALS, limit: 10 }),
      )

      expect(result.projects).toEqual([
        { id: "p1", name: "Alpha" },
        { id: "p2", name: "Beta" },
      ])
    })

    it("tolerates a missing objects envelope", async () => {
      stubTransport({})

      const result = await Effect.runPromise(
        createBraintrustAdapter().listProjects({ credentials: CREDENTIALS, limit: 10 }),
      )

      expect(result.projects).toEqual([])
    })
  })

  describe("normalize", () => {
    // Braintrust has no scalar `parent_span_id`; reading one left every span parentless, which
    // flattened each trace and made the engine count every span as its own trace.
    it("takes the parent from span_parents", () => {
      const result = createBraintrustAdapter().normalize(
        { span_id: "child-1", root_span_id: "root-1", span_parents: ["parent-1"] },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.parentSpanId).toMatch(/^[0-9a-f]{16}$/)
    })

    it("treats a span with no span_parents as the trace root", () => {
      const result = createBraintrustAdapter().normalize({ span_id: "root-1", is_root: true }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.parentSpanId).toBe("")
    })

    it.each([
      ["a raised string", "boom", "boom"],
      ["a structured failure", { message: "boom" }, '{"message":"boom"}'],
    ])("reports %s as an error", (_label, error, expected) => {
      const result = createBraintrustAdapter().normalize({ span_id: "s1", error }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.statusCode).toBe("error")
      expect(result.span.statusMessage).toBe(expected)
    })

    it.each([[undefined], [null], [""], [{}]])("treats %s as no error", (error) => {
      const result = createBraintrustAdapter().normalize({ span_id: "s1", error }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.statusCode).toBe("ok")
      expect(result.span.statusMessage).toBe("")
    })

    it.each([
      ["llm", "chat"],
      ["task", "invoke_agent"],
      ["tool", "execute_tool"],
      ["score", "evaluator"],
      ["something_new", "unspecified"],
    ])("maps span type %s onto the %s operation", (type, operation) => {
      const result = createBraintrustAdapter().normalize({ span_id: "s1", span_attributes: { type } }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.operation).toBe(operation)
    })

    const span = {
      span_id: "span-1",
      root_span_id: "root-1",
      span_parents: ["parent-1"],
      span_attributes: { name: "llm call", type: "llm" },
      input: "hello",
      output: "hi",
      metadata: { session_id: "sess-1", user_id: "u-1", model: "claude", tenant: { id: 7 } },
      tags: ["prod"],
      metrics: { prompt_tokens: 9, completion_tokens: 3 },
      created: "2026-01-05T10:00:00.000Z",
    }

    it("derives the trace from root_span_id and maps identity fields", () => {
      const result = createBraintrustAdapter().normalize(span, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span).toMatchObject({
        sessionId: "sess-1",
        userId: "u-1",
        name: "llm call",
        operation: "chat",
        model: "claude",
        tags: ["prod"],
        tokensInput: 9,
        tokensOutput: 3,
      })
      expect(result.span.metadata["import.source_trace_id"]).toBe("root-1")
      expect(result.span.metadata["import.source_span_id"]).toBe("span-1")
      expect(result.span.metadata.tenant).toBe('{"id":7}')
    })

    // Braintrust swaps an image's `image_url.url` string for an attachment object, which makes the
    // payload invalid OpenAI. The translator then could not place the dialect and fell to its lossy
    // fallback, which dropped the attachment and left the message empty.
    it("keeps an out-of-line attachment addressable, even beside a tool exchange", () => {
      const attachment = {
        type: "image_url",
        image_url: { url: { type: "braintrust_attachment", content_type: "image/png", key: "abc-123" } },
      }
      const withToolExchange = [
        { role: "user", content: [{ type: "text", text: "look" }, attachment] },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "c", type: "function", function: { name: "t", arguments: "{}" } }],
        },
        { role: "tool", tool_call_id: "c", content: "ok" },
      ]

      const result = createBraintrustAdapter().normalize(
        { span_id: "s1", span_attributes: { type: "llm" }, input: withToolExchange },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      const media = result.span.inputMessages.flatMap((m) => m.parts ?? []).find((p) => p.type === "uri")
      expect(media).toEqual({ type: "uri", modality: "image", uri: "braintrust-attachment:abc-123" })
    })

    it("leaves an attachment with no key as it came", () => {
      const result = createBraintrustAdapter().normalize(
        {
          span_id: "s1",
          span_attributes: { type: "llm" },
          input: [
            {
              role: "user",
              content: [{ type: "image_url", image_url: { url: { type: "braintrust_attachment" } } }],
            },
          ],
        },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.inputMessages.flatMap((m) => m.parts ?? []).some((p) => p.type === "uri")).toBe(false)
    })

    // Braintrust flattens `gen_ai.output.messages` into `{role, content}` on its way to the
    // `output` column, which drops a reasoning part outright — a thinking model's whole rationale,
    // recoverable from nowhere else in the row. The source attribute is the lossless copy.
    describe("preserved GenAI message attributes", () => {
      const reasoning = "They were locked out by the SSO migration, so check the IdP mapping first."
      const reply = "Check how your identity provider maps those two accounts."

      it("prefers a preserved output attribute over the flattened column", () => {
        const result = createBraintrustAdapter().normalize(
          {
            span_id: "s1",
            span_attributes: { type: "llm" },
            output: [{ role: "assistant", content: reply }],
            metadata: {
              "gen_ai.output.messages": JSON.stringify([
                {
                  role: "assistant",
                  parts: [
                    { type: "thinking", content: reasoning },
                    { type: "text", content: reply },
                  ],
                },
              ]),
            },
          },
          CONTEXT,
          CONFIG,
        )
        if (result.status !== "ok") throw new Error("expected ok")

        expect(result.span.outputMessages).toEqual([
          {
            role: "assistant",
            parts: [
              { type: "reasoning", content: reasoning },
              { type: "text", content: reply },
            ],
          },
        ])
      })

      // Braintrust stores some preserved attributes parsed rather than as the string they arrived as.
      it("reads a preserved input attribute stored as an array", () => {
        const result = createBraintrustAdapter().normalize(
          {
            span_id: "s1",
            span_attributes: { type: "llm" },
            input: [{ role: "user", content: "flattened" }],
            metadata: {
              "gen_ai.input.messages": [{ role: "user", parts: [{ type: "text", content: "preserved" }] }],
            },
          },
          CONTEXT,
          CONFIG,
        )
        if (result.status !== "ok") throw new Error("expected ok")

        expect(result.span.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "preserved" }] }])
      })

      it.each([
        ["" as unknown],
        [[]],
        [undefined],
      ])("falls back to the mapped column when the attribute holds %s", (preserved) => {
        const result = createBraintrustAdapter().normalize(
          {
            span_id: "s1",
            span_attributes: { type: "llm" },
            output: [{ role: "assistant", content: reply }],
            metadata: { "gen_ai.output.messages": preserved },
          },
          CONTEXT,
          CONFIG,
        )
        if (result.status !== "ok") throw new Error("expected ok")

        expect(result.span.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: reply }] }])
      })
    })

    // Braintrust keeps the instrumentation's own span name, which for Pydantic AI is
    // "running tool: <name>", so naming the tool after the span produced a set of tools called
    // `running tool: lookup_order` that never grouped with the same tool ingested live.
    it("names a tool span from gen_ai.tool.name, not the span name", () => {
      const result = createBraintrustAdapter().normalize(
        {
          span_id: "s1",
          span_attributes: { name: "running tool: lookup_order", type: "tool" },
          metadata: { "gen_ai.tool.name": "lookup_order" },
        },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.toolName).toBe("lookup_order")
    })

    it("falls back to the span name when no tool attribute is present", () => {
      const result = createBraintrustAdapter().normalize(
        { span_id: "s1", span_attributes: { name: "search_kb", type: "tool" }, metadata: {} },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.toolName).toBe("search_kb")
    })

    // Braintrust exposes no request-parameters field, so the tool set is only ever in metadata:
    // as the OTEL attribute, or as Braintrust's own OpenAI-shaped rewrite of it.
    it.each([
      [
        "the OTEL attribute",
        {
          "gen_ai.tool.definitions": JSON.stringify([
            { type: "function", name: "search_kb", description: "Search the KB", parameters: { type: "object" } },
          ]),
        },
      ],
      [
        "Braintrust's own rewrite",
        {
          tools: JSON.stringify([
            { type: "function", function: { name: "search_kb", description: "Search the KB", parameters: {} } },
          ]),
        },
      ],
    ])("reads tool definitions from %s", (_label, metadata) => {
      const result = createBraintrustAdapter().normalize(
        { span_id: "s1", span_attributes: { type: "llm" }, metadata },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.toolDefinitions.map((tool) => tool.name)).toEqual(["search_kb"])
      expect(result.span.toolNames).toEqual(["search_kb"])
    })

    // Giving only the root an id split one trace over two sessions: the session rollup keys on
    // `coalesce(nullIf(session_id, ''), trace_id)`, so the root sat under its span id while its
    // children fell through to the trace id.
    it.each([
      ["a root span", { span_id: "span-9", is_root: true, metadata: {} }],
      ["a child span", { span_id: "span-9", span_parents: ["span-1"], metadata: {} }],
    ])("leaves the session empty on %s when Braintrust carries none", (_label, row) => {
      const result = createBraintrustAdapter().normalize(row, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.sessionId).toBe("")
    })

    it("keeps an explicit session from metadata", () => {
      const result = createBraintrustAdapter().normalize(
        { span_id: "span-9", is_root: true, metadata: { session_id: "sess-a" } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.sessionId).toBe("sess-a")
    })

    it("leaves the session empty for a non-root span with no metadata session", () => {
      const result = createBraintrustAdapter().normalize({ span_id: "span-9", metadata: {} }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.sessionId).toBe("")
    })

    it("treats a span with no root as its own trace", () => {
      const result = createBraintrustAdapter().normalize({ span_id: "span-9" }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.metadata["import.source_trace_id"]).toBe("span-9")
    })

    it("skips a row with no span_id", () => {
      expect(createBraintrustAdapter().normalize({ root_span_id: "r" }, CONTEXT, CONFIG)).toEqual({
        status: "skip",
        reason: "missing span_id",
      })
    })

    it("takes the span boundaries from metrics, so an imported span keeps its duration", () => {
      const result = createBraintrustAdapter().normalize(
        { ...span, metrics: { ...span.metrics, start: 1_767_607_200, end: 1_767_607_202.5 } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.startTime).toEqual(new Date(1_767_607_200_000))
      expect(result.span.endTime).toEqual(new Date(1_767_607_202_500))
    })

    it("falls back to created for both ends when metrics carry no boundaries", () => {
      const result = createBraintrustAdapter().normalize(span, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.startTime).toEqual(new Date(span.created))
      expect(result.span.endTime).toEqual(new Date(span.created))
    })

    it("keeps the start when only it is reported, rather than inventing an end", () => {
      const result = createBraintrustAdapter().normalize(
        { ...span, metrics: { start: 1_767_607_200 } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.startTime).toEqual(new Date(1_767_607_200_000))
      expect(result.span.endTime).toEqual(new Date(1_767_607_200_000))
    })

    // Braintrust reports no cost of its own, so models.dev pricing is the only source, and
    // that needs the provider as well as the model.
    it("prices the span from models.dev using the provider in metadata", () => {
      const result = createBraintrustAdapter().normalize(
        { ...span, metadata: { ...span.metadata, provider: "openai", model: "gpt-4o-mini" } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.provider).toBe("openai")
      expect(result.span.costIsEstimated).toBe(true)
      expect(result.span.costTotalMicrocents).toBeGreaterThan(0)
    })

    it("leaves cost at zero when metadata names no provider", () => {
      const result = createBraintrustAdapter().normalize(span, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.provider).toBe("")
      expect(result.span.costTotalMicrocents).toBe(0)
    })

    // Braintrust documents that `prompt_tokens` includes the cached and cache-creation counts,
    // so storing it as-is next to the cache columns would count those tokens twice.
    it("converts Braintrust's inclusive token counts to the additive breakdown", () => {
      const result = createBraintrustAdapter().normalize(
        {
          ...span,
          metrics: {
            prompt_tokens: 18,
            prompt_cached_tokens: 10,
            prompt_cache_creation_tokens: 5,
            completion_tokens: 12,
            completion_reasoning_tokens: 4,
          },
        },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.tokensInput).toBe(3)
      expect(result.span.tokensCacheRead).toBe(10)
      expect(result.span.tokensCacheCreate).toBe(5)
      expect(result.span.tokensOutput).toBe(8)
      expect(result.span.tokensReasoning).toBe(4)
    })

    it("never drives a token count below zero when the counts disagree", () => {
      const result = createBraintrustAdapter().normalize(
        { ...span, metrics: { prompt_tokens: 5, prompt_cached_tokens: 20 } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.tokensInput).toBe(0)
    })

    it("takes the cost Braintrust estimated rather than pricing it again", () => {
      const result = createBraintrustAdapter().normalize(
        { ...span, metrics: { ...span.metrics, estimated_cost: 0.0025 } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.costTotalMicrocents).toBe(250_000)
      expect(result.span.costSource).toBe("provider_reported")
    })

    // Braintrust reports one total and no breakdown, so the sides are ours to estimate. Sending them
    // as zeros instead would claim the call was free on both halves while the total says otherwise.
    it("estimates the sides beside the total Braintrust reported", () => {
      const priced = {
        ...span,
        metadata: { ...span.metadata, "gen_ai.provider.name": "openai", model: "gpt-4o-mini" },
        metrics: { ...span.metrics, estimated_cost: 0.0025 },
      }
      const result = createBraintrustAdapter().normalize(priced, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.costTotalMicrocents).toBe(250_000)
      expect(result.span.costInputMicrocents).toBeGreaterThan(0)
      expect(result.span.costOutputMicrocents).toBeGreaterThan(0)
    })

    // No cost metric at all is a gap in our pricing, not a free call.
    it("marks a span Braintrust priced at nothing as unpriced rather than reported", () => {
      const result = createBraintrustAdapter().normalize(span, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.costSource).toBe("unpriced")
      expect(result.span.costTotalMicrocents).toBe(0)
    })

    it("reads time to first token as seconds, matching the start and end metrics", () => {
      const result = createBraintrustAdapter().normalize(
        { ...span, metrics: { start: 1_767_607_200, end: 1_767_607_202.5, time_to_first_token: 0.4 } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.timeToFirstTokenNs).toBe(400_000_000)
      expect(result.span.isStreaming).toBe(true)
    })

    it("maps the review span type onto an evaluator", () => {
      const result = createBraintrustAdapter().normalize(
        { ...span, span_attributes: { name: "human review", type: "review" } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.operation).toBe("evaluator")
    })

    it("takes the exception class off a structured error", () => {
      const result = createBraintrustAdapter().normalize(
        { ...span, error: { type: "RateLimitError", message: "slow down" } },
        CONTEXT,
        CONFIG,
      )
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.statusCode).toBe("error")
      expect(result.span.errorType).toBe("RateLimitError")
    })

    // A bare string error names no class, and a literal "error" would read as one — collapsing every
    // distinct failure into a single group in the errored-span breakdown. Ingest leaves it empty too.
    it("leaves the error type empty for a bare string error", () => {
      const result = createBraintrustAdapter().normalize({ ...span, error: "it broke" }, CONTEXT, CONFIG)
      if (result.status !== "ok") throw new Error("expected ok")

      expect(result.span.statusCode).toBe("error")
      expect(result.span.errorType).toBe("")
    })

    it("records the tool a tool span ran", () => {
      const result = createBraintrustAdapter().normalize(
        {
          ...span,
          span_attributes: { name: "get_weather", type: "tool" },
          input: { city: "SF" },
          output: { tempC: 21 },
        },
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
