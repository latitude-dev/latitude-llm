import type { DomainEvent, EventsPublisher } from "@domain/events"
import type { QueuePublishError } from "@domain/queue"
import { ChSqlClient, type ChSqlClientShape, OrganizationId, StorageDisk } from "@domain/shared"
import { createFakeStorageDisk } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SpanRepository } from "../ports/span-repository.ts"
import { createFakeSpanRepository } from "../testing/fake-span-repository.ts"
import { processIngestedSpansUseCase } from "./process-ingested-spans.ts"

const ORGANIZATION_ID = OrganizationId("org_realtime_sandbox_test_aaa")

const validRequest = {
  resourceSpans: [
    {
      resource: { attributes: [{ key: "service.name", value: { stringValue: "test" } }] },
      scopeSpans: [
        {
          scope: { name: "test", version: "1.0.0" },
          spans: [
            {
              traceId: "0af7651916cd43dd8448eb211c80319c",
              spanId: "b7ad6b7169203331",
              name: "test-span",
              startTimeUnixNano: "1710590400000000000",
              endTimeUnixNano: "1710590401000000000",
              attributes: [],
              status: { code: 1 },
            },
          ],
        },
      ],
    },
  ],
}

const inlinePayload = Buffer.from(JSON.stringify(validRequest), "utf-8").toString("base64")

const createFakeEventsPublisher = (): EventsPublisher<QueuePublishError> & { readonly published: DomainEvent[] } => {
  const published: DomainEvent[] = []
  return {
    published,
    publish: (event) => {
      published.push(event)
      return Effect.void
    },
  }
}

const run = (isSandbox: boolean) => {
  const eventsPublisher = createFakeEventsPublisher()
  const { repository: spanRepo } = createFakeSpanRepository()

  const effect = processIngestedSpansUseCase({ eventsPublisher })({
    organizationId: ORGANIZATION_ID,
    apiKeyId: "key-1",
    contentType: "application/json",
    ingestedAt: new Date("2026-03-18T10:00:00.000Z"),
    isSandbox,
    inlinePayload,
    fileKey: null,
    defaultProjectId: "proj_realtime_sandbox_test",
    projectIdBySlug: {},
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(SpanRepository, spanRepo),
        Layer.succeed(StorageDisk, createFakeStorageDisk().disk),
        Layer.succeed(ChSqlClient, {} as ChSqlClientShape),
      ),
    ),
  )

  return { effect, eventsPublisher }
}

describe("processIngestedSpansUseCase sandbox bit", () => {
  it("stamps the sandbox bit on the TracesIngested event for sandbox orgs", async () => {
    const { effect, eventsPublisher } = run(true)
    await Effect.runPromise(effect)

    expect(eventsPublisher.published[0]).toMatchObject({
      name: "TracesIngested",
      payload: { isSandbox: true },
    })
  })

  it("emits the TracesIngested event without the sandbox bit for live orgs", async () => {
    const { effect, eventsPublisher } = run(false)
    await Effect.runPromise(effect)

    expect(eventsPublisher.published[0]).toMatchObject({
      name: "TracesIngested",
      payload: { isSandbox: false },
    })
  })
})

const EMAIL = "victim@example.com"
const PROJECT_ID = "proj_realtime_sandbox_test"
const OTHER_PROJECT_ID = "proj_other_redaction_test"

const spanWith = (attributes: { key: string; value: { stringValue: string } }[], spanId: string, slug?: string) => ({
  traceId: "0af7651916cd43dd8448eb211c80319c",
  spanId,
  name: "chat",
  startTimeUnixNano: "1710590400000000000",
  endTimeUnixNano: "1710590401000000000",
  attributes: slug ? [...attributes, { key: "latitude.project", value: { stringValue: slug } }] : attributes,
  status: { code: 1 },
})

const contentAttributes = [
  { key: "gen_ai.system", value: { stringValue: "openai" } },
  {
    key: "gen_ai.input.messages",
    value: {
      stringValue: JSON.stringify([{ role: "user", parts: [{ type: "text", content: `contact ${EMAIL}` }] }]),
    },
  },
]

const payloadFor = (spans: unknown[]) =>
  Buffer.from(
    JSON.stringify({
      resourceSpans: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: "test" } }] },
          scopeSpans: [{ scope: { name: "test", version: "1.0.0" }, spans }],
        },
      ],
    }),
    "utf-8",
  ).toString("base64")

const enforcePolicy = {
  entities: ["email" as const],
  redactMetadata: false,
  identities: "keep" as const,
}

const runRedaction = (opts: {
  payload?: string
  fileKey?: string | null
  redaction?: Record<string, unknown>
  projectIdBySlug?: Record<string, string>
}) => {
  const eventsPublisher = createFakeEventsPublisher()
  const { repository: spanRepo, inserted } = createFakeSpanRepository()
  const payload = opts.payload ?? payloadFor([spanWith(contentAttributes, "b7ad6b7169203331")])
  const storage = createFakeStorageDisk({
    getBytes: async () => new Uint8Array(Buffer.from(payload, "base64")),
  })

  const effect = processIngestedSpansUseCase({ eventsPublisher })({
    organizationId: ORGANIZATION_ID,
    apiKeyId: "key-1",
    contentType: "application/json",
    ingestedAt: new Date("2026-03-18T10:00:00.000Z"),
    isSandbox: false,
    inlinePayload: opts.fileKey ? null : payload,
    fileKey: opts.fileKey ?? null,
    defaultProjectId: PROJECT_ID,
    projectIdBySlug: opts.projectIdBySlug ?? {},
    ...(opts.redaction ? { redaction: opts.redaction as never } : {}),
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(SpanRepository, spanRepo),
        Layer.succeed(StorageDisk, storage.disk),
        Layer.succeed(ChSqlClient, {} as ChSqlClientShape),
      ),
    ),
  )

  return { effect, inserted, eventsPublisher, storage }
}

describe("processIngestedSpansUseCase redaction", () => {
  it("inserts byte-identical rows when no project opted in", async () => {
    const withoutField = runRedaction({})
    await Effect.runPromise(withoutField.effect)

    const withEmptyMap = runRedaction({ redaction: {} })
    await Effect.runPromise(withEmptyMap.effect)

    expect(JSON.stringify(withEmptyMap.inserted)).toBe(JSON.stringify(withoutField.inserted))
    expect(JSON.stringify(withoutField.inserted)).toContain(EMAIL)
  })

  it("redacts content and drops the duplicated content attribute for an enforce project", async () => {
    const { effect, inserted } = runRedaction({ redaction: { [PROJECT_ID]: enforcePolicy } })
    await Effect.runPromise(effect)

    const span = inserted[0]?.[0]
    expect(JSON.stringify(inserted)).not.toContain(EMAIL)
    expect(JSON.stringify(span?.inputMessages)).toContain("[REDACTED_EMAIL]")
    expect(span?.attrString).not.toHaveProperty("gen_ai.input.messages")
    expect(span?.attrString["gen_ai.system"]).toBe("openai")
  })

  it("redacts only the opted-in project in a multi-project batch", async () => {
    const payload = payloadFor([
      spanWith(contentAttributes, "b7ad6b7169203331", "primary"),
      spanWith(contentAttributes, "b7ad6b7169203332", "secondary"),
    ])
    const { effect, inserted } = runRedaction({
      payload,
      projectIdBySlug: { primary: PROJECT_ID, secondary: OTHER_PROJECT_ID },
      redaction: { [PROJECT_ID]: enforcePolicy },
    })
    await Effect.runPromise(effect)

    const spans = inserted[0] ?? []
    const primary = spans.find((span) => (span.projectId as string) === PROJECT_ID)
    const secondary = spans.find((span) => (span.projectId as string) === OTHER_PROJECT_ID)

    expect(JSON.stringify(primary?.inputMessages)).toContain("[REDACTED_EMAIL]")
    expect(JSON.stringify(secondary?.inputMessages)).toContain(EMAIL)
  })

  it("still publishes TracesIngested after redacting, so downstream consumers see redacted content", async () => {
    const { effect, eventsPublisher } = runRedaction({ redaction: { [PROJECT_ID]: enforcePolicy } })
    await Effect.runPromise(effect)

    expect(eventsPublisher.published[0]).toMatchObject({ name: "TracesIngested" })
  })

  it("fails without inserting when a policy is present but malformed", async () => {
    const { effect, inserted } = runRedaction({ redaction: { [PROJECT_ID]: { entities: "not-an-array" } } })
    const exit = await Effect.runPromiseExit(effect)

    expect(exit._tag).toBe("Failure")
    expect(inserted).toHaveLength(0)
  })

  it("fails without inserting when a policy names an unknown entity", async () => {
    const { effect, inserted } = runRedaction({
      redaction: { [PROJECT_ID]: { ...enforcePolicy, entities: ["passport"] } },
    })
    const exit = await Effect.runPromiseExit(effect)

    expect(exit._tag).toBe("Failure")
    expect(inserted).toHaveLength(0)
  })

  it("deletes the buffered payload once the spans are durable", async () => {
    const { effect, storage, inserted } = runRedaction({
      fileKey: "tmp-ingest/org/proj/abc.json",
      redaction: { [PROJECT_ID]: enforcePolicy },
    })
    await Effect.runPromise(effect)

    expect(inserted).toHaveLength(1)
    expect(storage.deleted).toEqual(["tmp-ingest/org/proj/abc.json"])
  })

  it("does not delete an inline payload, which has no object to delete", async () => {
    const { effect, storage } = runRedaction({ redaction: { [PROJECT_ID]: enforcePolicy } })
    await Effect.runPromise(effect)

    expect(storage.deleted).toEqual([])
  })

  it("keeps the ingest successful when deleting the buffered payload fails", async () => {
    const eventsPublisher = createFakeEventsPublisher()
    const { repository: spanRepo, inserted } = createFakeSpanRepository()
    const payload = payloadFor([spanWith(contentAttributes, "b7ad6b7169203331")])
    const storage = createFakeStorageDisk({
      getBytes: async () => new Uint8Array(Buffer.from(payload, "base64")),
      delete: async () => {
        throw new Error("object store unavailable")
      },
    })

    const effect = processIngestedSpansUseCase({ eventsPublisher })({
      organizationId: ORGANIZATION_ID,
      apiKeyId: "key-1",
      contentType: "application/json",
      ingestedAt: new Date("2026-03-18T10:00:00.000Z"),
      isSandbox: false,
      inlinePayload: null,
      fileKey: "tmp-ingest/org/proj/abc.json",
      defaultProjectId: PROJECT_ID,
      projectIdBySlug: {},
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(SpanRepository, spanRepo),
          Layer.succeed(StorageDisk, storage.disk),
          Layer.succeed(ChSqlClient, {} as ChSqlClientShape),
        ),
      ),
    )

    const exit = await Effect.runPromiseExit(effect)

    expect(exit._tag).toBe("Success")
    expect(inserted).toHaveLength(1)
  })
})
