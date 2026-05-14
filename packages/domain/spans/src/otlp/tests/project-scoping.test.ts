import { describe, expect, it } from "vitest"
import { resolveSpanProjectSlug, transformOtlpToSpans } from "../transform.ts"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue } from "../types.ts"

const TRACE = "0af7651916cd43dd8448eb211c80319c"

const str = (key: string, value: string): OtlpKeyValue => ({ key, value: { stringValue: value } })

const buildSpan = (spanId: string, slug?: string): NonNullable<OtlpExportTraceServiceRequest["resourceSpans"]> => [
  {
    resource: { attributes: [str("service.name", "test")] },
    scopeSpans: [
      {
        scope: { name: "scope", version: "1" },
        spans: [
          {
            traceId: TRACE,
            spanId,
            name: spanId,
            startTimeUnixNano: "1710590400000000000",
            endTimeUnixNano: "1710590401000000000",
            attributes: slug ? [str("latitude.project", slug)] : [],
            status: { code: 1 },
          },
        ],
      },
    ],
  },
]

const baseContext = {
  organizationId: "org-1",
  apiKeyId: "key-1",
  ingestedAt: new Date("2026-04-10T12:00:00.000Z"),
}

describe("resolveSpanProjectSlug", () => {
  it("prefers a span attribute over a resource attribute", () => {
    const span = [str("latitude.project", "span-slug"), str("other.attr", "x")]
    const resource = [str("latitude.project", "resource-slug")]
    expect(resolveSpanProjectSlug(span, resource)).toBe("span-slug")
  })

  it("falls back to the resource attribute when the span attribute is missing", () => {
    const span = [str("other.attr", "x")]
    const resource = [str("latitude.project", "resource-slug")]
    expect(resolveSpanProjectSlug(span, resource)).toBe("resource-slug")
  })

  it("returns undefined when neither is set", () => {
    expect(resolveSpanProjectSlug([], [])).toBeUndefined()
  })
})

describe("transformOtlpToSpans per-span project resolution", () => {
  it("uses the span attribute slug → projectId map", () => {
    const { spans, rejectedSpans } = transformOtlpToSpans(
      { resourceSpans: buildSpan("s1", "primary") },
      {
        ...baseContext,
        defaultProjectId: null,
        projectIdBySlug: new Map([["primary", "proj-primary"]]),
      },
    )
    expect(rejectedSpans).toBe(0)
    expect(spans).toHaveLength(1)
    expect(spans[0]?.projectId).toBe("proj-primary")
  })

  it("uses the resource attribute when the span has none", () => {
    const { spans } = transformOtlpToSpans(
      {
        resourceSpans: [
          {
            resource: { attributes: [str("latitude.project", "secondary")] },
            scopeSpans: [
              {
                scope: { name: "scope", version: "1" },
                spans: [
                  {
                    traceId: TRACE,
                    spanId: "r1",
                    name: "r1",
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
      },
      {
        ...baseContext,
        defaultProjectId: null,
        projectIdBySlug: new Map([["secondary", "proj-secondary"]]),
      },
    )
    expect(spans).toHaveLength(1)
    expect(spans[0]?.projectId).toBe("proj-secondary")
  })

  it("falls back to defaultProjectId when neither attribute is set", () => {
    const { spans, rejectedSpans } = transformOtlpToSpans(
      { resourceSpans: buildSpan("d1") },
      {
        ...baseContext,
        defaultProjectId: "proj-default",
        projectIdBySlug: new Map(),
      },
    )
    expect(rejectedSpans).toBe(0)
    expect(spans).toHaveLength(1)
    expect(spans[0]?.projectId).toBe("proj-default")
  })

  it("rejects spans whose slug is not in the map and has no default", () => {
    const { spans, rejectedSpans } = transformOtlpToSpans(
      { resourceSpans: buildSpan("x1", "unknown-slug") },
      {
        ...baseContext,
        defaultProjectId: null,
        projectIdBySlug: new Map(),
      },
    )
    expect(rejectedSpans).toBe(1)
    expect(spans).toHaveLength(0)
  })

  it("rejects spans with no slug and no default", () => {
    const { spans, rejectedSpans } = transformOtlpToSpans(
      { resourceSpans: buildSpan("u1") },
      {
        ...baseContext,
        defaultProjectId: null,
        projectIdBySlug: new Map(),
      },
    )
    expect(rejectedSpans).toBe(1)
    expect(spans).toHaveLength(0)
  })

  it("span attribute wins over resource attribute and over the header default", () => {
    const { spans } = transformOtlpToSpans(
      {
        resourceSpans: [
          {
            resource: { attributes: [str("latitude.project", "resource-slug")] },
            scopeSpans: [
              {
                scope: { name: "scope", version: "1" },
                spans: [
                  {
                    traceId: TRACE,
                    spanId: "pre",
                    name: "pre",
                    startTimeUnixNano: "1710590400000000000",
                    endTimeUnixNano: "1710590401000000000",
                    attributes: [str("latitude.project", "span-slug")],
                    status: { code: 1 },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        ...baseContext,
        defaultProjectId: "proj-default",
        projectIdBySlug: new Map([
          ["resource-slug", "proj-resource"],
          ["span-slug", "proj-span"],
        ]),
      },
    )
    expect(spans).toHaveLength(1)
    expect(spans[0]?.projectId).toBe("proj-span")
  })

  it("handles a mixed batch: some valid spans, some rejected", () => {
    const { spans, rejectedSpans } = transformOtlpToSpans(
      {
        resourceSpans: [
          {
            resource: { attributes: [str("service.name", "test")] },
            scopeSpans: [
              {
                scope: { name: "scope", version: "1" },
                spans: [
                  {
                    traceId: TRACE,
                    spanId: "ok1",
                    name: "ok1",
                    startTimeUnixNano: "1710590400000000000",
                    endTimeUnixNano: "1710590401000000000",
                    attributes: [str("latitude.project", "primary")],
                    status: { code: 1 },
                  },
                  {
                    traceId: TRACE,
                    spanId: "rej1",
                    name: "rej1",
                    startTimeUnixNano: "1710590400000000000",
                    endTimeUnixNano: "1710590401000000000",
                    attributes: [str("latitude.project", "unknown")],
                    status: { code: 1 },
                  },
                  {
                    traceId: TRACE,
                    spanId: "ok2",
                    name: "ok2",
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
      },
      {
        ...baseContext,
        defaultProjectId: "proj-default",
        projectIdBySlug: new Map([["primary", "proj-primary"]]),
      },
    )
    expect(rejectedSpans).toBe(1)
    expect(spans).toHaveLength(2)
    expect(spans[0]?.projectId).toBe("proj-primary")
    expect(spans[1]?.projectId).toBe("proj-default")
  })
})
