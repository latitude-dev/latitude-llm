import { LatitudeSpanProcessor } from "@latitude-data/telemetry"
import { context, type TracerProvider, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { BasicTracerProvider, InMemorySpanExporter } from "@opentelemetry/sdk-trace-base"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { runWithAiTelemetry } from "./index.ts"

/**
 * End-to-end contract test for the Latitude AI telemetry chain.
 *
 * Exercises the real pipeline:
 *   runWithAiTelemetry
 *     → @latitude-data/telemetry capture()
 *     → LatitudeSpanProcessor.onStart (context -> span attributes)
 *     → SimpleSpanProcessor export
 *     → InMemorySpanExporter
 *
 * Motivated by the dogfood identity strategy (PRD: "Identity strategy") where
 * the `scoreId` metadata key must survive every hop so Latitude-side trace
 * filters can recover the upstream trace from a single id. But the contract
 * under test is generic: **any metadata key passed via `telemetry.metadata`
 * must reach the exported span as `latitude.metadata` JSON.**
 *
 * If a future refactor drops metadata propagation (processor change, capture
 * rewrite, OTel SDK bump altering flush semantics, etc.) this test fails
 * loudly instead of silently breaking every AI feature's observability.
 */
describe("runWithAiTelemetry metadata propagation (e2e)", () => {
  const exporter = new InMemorySpanExporter()
  let provider: BasicTracerProvider
  let previousTracerProvider: TracerProvider

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager())
    previousTracerProvider = trace.getTracerProvider()
    provider = new BasicTracerProvider({
      spanProcessors: [
        new LatitudeSpanProcessor("test-api-key", "test-project", {
          exporter,
          disableBatch: true,
          disableRedact: true,
        }),
      ],
    })
    trace.setGlobalTracerProvider(provider)
  })

  beforeEach(() => {
    exporter.reset()
  })

  afterAll(async () => {
    // Restore the prior tracer provider before shutting ours down so any
    // follow-up test files in the same Vitest worker don't accidentally get
    // a shut-down tracer (noop-on-read but silently dropping spans).
    trace.setGlobalTracerProvider(previousTracerProvider)
    await provider.shutdown()
  })

  const parseMetadata = (raw: unknown): Record<string, unknown> => {
    expect(typeof raw).toBe("string")
    return JSON.parse(raw as string) as Record<string, unknown>
  }

  it("propagates scoreId from telemetry.metadata onto the exported span", async () => {
    const scoreId = "score-abc-def-ghi"

    const result = await runWithAiTelemetry(
      {
        spanName: "flagger.draft",
        tags: ["flagger:draft"],
        metadata: {
          organizationId: "org-1",
          projectId: "proj-1",
          traceId: "trace-1",
          queueSlug: "refusal",
          scoreId,
        },
      },
      async () => "fake-ai-response",
    )

    expect(result).toBe("fake-ai-response")
    await provider.forceFlush()

    const [exported] = exporter.getFinishedSpans()
    expect(exported).toBeDefined()

    const metadata = parseMetadata(exported?.attributes["latitude.metadata"])
    expect(metadata.scoreId).toBe(scoreId)
    expect(metadata.organizationId).toBe("org-1")
    expect(metadata.queueSlug).toBe("refusal")
  })

  it("propagates arbitrary metadata keys — not specific to scoreId", async () => {
    await runWithAiTelemetry(
      {
        spanName: "annotation.enrich.publication",
        tags: ["annotation:enrichment"],
        metadata: {
          arbitraryKeyA: "value-a",
          arbitraryKeyB: 42,
          arbitraryKeyC: true,
        },
      },
      async () => undefined,
    )

    await provider.forceFlush()

    const [exported] = exporter.getFinishedSpans()
    const metadata = parseMetadata(exported?.attributes["latitude.metadata"])
    expect(metadata.arbitraryKeyA).toBe("value-a")
    expect(metadata.arbitraryKeyB).toBe(42)
    expect(metadata.arbitraryKeyC).toBe(true)
  })

  it("stamps the span name and tags alongside metadata", async () => {
    await runWithAiTelemetry(
      {
        spanName: "flagger.draft",
        tags: ["flagger:draft"],
        metadata: { scoreId: "score-xyz" },
      },
      async () => undefined,
    )

    await provider.forceFlush()

    const [exported] = exporter.getFinishedSpans()
    expect(exported?.name).toBe("flagger.draft")
    expect(exported?.attributes["latitude.capture.name"]).toBe("flagger.draft")
    expect(exported?.attributes["latitude.tags"]).toBe(JSON.stringify(["flagger:draft"]))
  })

  it("does not emit a span when telemetry is undefined", async () => {
    const result = await runWithAiTelemetry(undefined, async () => "bare-call")
    expect(result).toBe("bare-call")
    await provider.forceFlush()

    expect(exporter.getFinishedSpans()).toHaveLength(0)
  })
})
