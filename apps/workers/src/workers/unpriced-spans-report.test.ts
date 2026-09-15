import { OrganizationId } from "@domain/shared"
import type { UnpricedSpanGroup } from "@domain/spans"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MAX_TRACKED_PAIRS, reportUnpricedSpans, resetUnpricedSpanReportThrottle } from "./unpriced-spans-report.ts"

const organizationId = OrganizationId("org_1")

function group(overrides: Partial<UnpricedSpanGroup> = {}): UnpricedSpanGroup {
  return {
    projectId: "proj_1",
    provider: "@some-vendor/unmapped-sdk",
    model: "mystery-model",
    spans: 3,
    ...overrides,
  }
}

interface ReportedLog {
  readonly level: string
  readonly args: readonly unknown[]
}

describe("reportUnpricedSpans", () => {
  let lines: string[]

  beforeEach(() => {
    resetUnpricedSpanReportThrottle()
    lines = []
    vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      lines.push(String(line))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const reported = (): ReportedLog[] => lines.map((line) => JSON.parse(line) as ReportedLog)

  it("reports the provider and model that failed to price", () => {
    Effect.runSync(reportUnpricedSpans([group()], organizationId))

    const logs = reported()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.level).toBe("error")
    expect(logs[0]?.args[1]).toMatchObject({
      organizationId: "org_1",
      projectId: "proj_1",
      provider: "@some-vendor/unmapped-sdk",
      model: "mystery-model",
      spans: 3,
    })
  })

  it("reports a repeated pair only once so customer traffic cannot drive the volume", () => {
    Effect.runSync(reportUnpricedSpans([group()], organizationId))
    Effect.runSync(reportUnpricedSpans([group({ spans: 900 })], organizationId))
    Effect.runSync(reportUnpricedSpans([group({ spans: 12 })], organizationId))

    expect(reported()).toHaveLength(1)
  })

  it("throttles per pair, so a distinct model, project or org still reports", () => {
    Effect.runSync(
      reportUnpricedSpans([group(), group({ model: "other-model" }), group({ projectId: "proj_2" })], organizationId),
    )
    Effect.runSync(reportUnpricedSpans([group()], OrganizationId("org_2")))

    expect(reported()).toHaveLength(4)
  })

  it("does nothing when every span was priced", () => {
    Effect.runSync(reportUnpricedSpans([], organizationId))

    expect(lines).toHaveLength(0)
  })

  // Datadog ingests a span's recorded "exception" event as a second, attribute-less Error Tracking
  // occurrence alongside the one derived from the span's own error.* attributes, silently doubling
  // this issue's reported volume. The reporting span must carry error info only via attributes.
  it("reports the error via span attributes only, never span.recordException", async () => {
    const setAttributes = vi.fn()
    const setStatus = vi.fn()
    const end = vi.fn()
    const recordException = vi.fn()
    const startSpan = vi.fn().mockReturnValue({ setAttributes, setStatus, end, recordException })

    vi.resetModules()
    vi.doMock("@repo/observability", async () => {
      const actual = await vi.importActual<typeof import("@repo/observability")>("@repo/observability")
      return { ...actual, trace: { ...actual.trace, getTracer: () => ({ startSpan }) } }
    })

    const isolated = await import("./unpriced-spans-report.ts")
    isolated.resetUnpricedSpanReportThrottle()
    Effect.runSync(isolated.reportUnpricedSpans([group()], organizationId))

    vi.doUnmock("@repo/observability")
    vi.resetModules()

    expect(recordException).not.toHaveBeenCalled()
    expect(setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "gen_ai.provider.name": "@some-vendor/unmapped-sdk",
        "gen_ai.request.model": "mystery-model",
        "error.type": "UnpricedSpanError",
        "error.message": "Ingested token usage that no pricing matched; cost recorded as 0",
      }),
    )
    expect(end).toHaveBeenCalledOnce()
  })

  // Overflow used to clear the whole map, which re-opened every pair still inside its window.
  it("keeps throttling a pair when a flood of new pairs overflows the tracked set", () => {
    Effect.runSync(reportUnpricedSpans([group({ model: "evicted-first" })], organizationId))
    Effect.runSync(reportUnpricedSpans([group()], organizationId))

    // Overflows the set by exactly one, so only the decoy above is old enough to be evicted.
    const flood = Array.from({ length: MAX_TRACKED_PAIRS - 1 }, (_, i) => group({ model: `flood-${i}` }))
    Effect.runSync(reportUnpricedSpans(flood, organizationId))

    const before = reported().length
    Effect.runSync(reportUnpricedSpans([group()], organizationId))

    expect(reported()).toHaveLength(before)
  })
})
