import { ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import type { SpanDetail } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { defaultSourceConfig } from "../entities/destination-source.ts"
import { DestinationMappers } from "../ports/destination-mapper.ts"
import { DestinationSourceReaders } from "../ports/destination-source-reader.ts"
import { createFakeDestinationMapper } from "../testing/fake-destination-mapper.ts"
import { fakeSourceReaderRegistry, staticSourceReader } from "../testing/fake-destination-source-reader.ts"
import { previewDestinationDeliveryUseCase } from "./preview-destination-delivery.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const ORG_ID = OrganizationId(cuid("o"))
const PROJECT_ID = ProjectId(cuid("p"))

// The fake mapper only reads spanId/traceId/endTime, so a minimal stub suffices.
const sampleSpan = { spanId: "0123456789abcdef", traceId: "t", endTime: new Date() } as unknown as SpanDetail

const run = (records: readonly SpanDetail[]) =>
  Effect.runPromise(
    previewDestinationDeliveryUseCase({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      kind: "posthog",
      source: "spans",
      sourceConfig: defaultSourceConfig("spans"),
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(ChSqlClient, createFakeChSqlClient()),
          Layer.succeed(
            DestinationSourceReaders,
            fakeSourceReaderRegistry(staticSourceReader({ records, nextCursor: null })),
          ),
          Layer.succeed(DestinationMappers, { posthog: { spans: createFakeDestinationMapper().mapper } }),
        ),
      ),
    ),
  )

describe("previewDestinationDeliveryUseCase", () => {
  it("maps the sampled records and reports they exist", async () => {
    const result = await run([sampleSpan])
    expect(result.hasData).toBe(true)
    expect(result.recordsSampled).toBe(1)
    expect(result.events).toHaveLength(1)
  })

  it("reports no data when the source is empty", async () => {
    const result = await run([])
    expect(result.hasData).toBe(false)
    expect(result.events).toHaveLength(0)
  })
})
