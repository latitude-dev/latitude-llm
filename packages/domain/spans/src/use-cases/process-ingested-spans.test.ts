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
