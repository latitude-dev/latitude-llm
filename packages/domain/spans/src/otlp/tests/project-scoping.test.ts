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

  // Malformed OTLP/JSON bodies are cast, not validated, so `attributes` can arrive as a
  // non-array (e.g. a key→value object). It must resolve to undefined, not throw `.find`.
  it("returns undefined when attributes is a non-array object", () => {
    const malformed = { "latitude.project": "span-slug" } as unknown as OtlpKeyValue[]
    expect(resolveSpanProjectSlug(malformed, [])).toBeUndefined()
  })

  it("falls back to the resource attribute when the span attributes are a non-array", () => {
    const malformed = { "latitude.project": "span-slug" } as unknown as OtlpKeyValue[]
    const resource = [str("latitude.project", "resource-slug")]
    expect(resolveSpanProjectSlug(malformed, resource)).toBe("resource-slug")
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

  it("does not crash the batch when a span has non-array attributes", () => {
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
                    spanId: "malformed",
                    name: "malformed",
                    startTimeUnixNano: "1710590400000000000",
                    endTimeUnixNano: "1710590401000000000",
                    attributes: { "latitude.project": "span-slug" } as unknown as OtlpKeyValue[],
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
        projectIdBySlug: new Map([["span-slug", "proj-span"]]),
      },
    )
    expect(rejectedSpans).toBe(0)
    expect(spans).toHaveLength(1)
    expect(spans[0]?.projectId).toBe("proj-default")
  })

  it("does not crash the batch when resource attributes are a non-array", () => {
    const { spans, rejectedSpans } = transformOtlpToSpans(
      {
        resourceSpans: [
          {
            resource: { attributes: { "service.name": "test" } as unknown as OtlpKeyValue[] },
            scopeSpans: [
              {
                scope: { name: "scope", version: "1" },
                spans: [
                  {
                    traceId: TRACE,
                    spanId: "res-malformed",
                    name: "res-malformed",
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
        projectIdBySlug: new Map(),
      },
    )
    expect(rejectedSpans).toBe(0)
    expect(spans).toHaveLength(1)
    expect(spans[0]?.projectId).toBe("proj-default")
    expect(spans[0]?.serviceName).toBe("")
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

describe("transformOtlpToSpans trace ID normalization", () => {
  const ctx = {
    ...baseContext,
    defaultProjectId: "proj-default",
    projectIdBySlug: new Map<string, string>(),
  }

  it("strips hyphens from a UUID-format trace ID", () => {
    const { spans } = transformOtlpToSpans(
      {
        resourceSpans: [
          {
            resource: { attributes: [str("service.name", "test")] },
            scopeSpans: [
              {
                scope: { name: "scope", version: "1" },
                spans: [
                  {
                    traceId: "0af76519-16cd-43dd-8448-eb211c80319c",
                    spanId: "n1",
                    name: "n1",
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
      ctx,
    )
    expect(spans).toHaveLength(1)
    expect(spans[0]?.traceId).toBe("0af7651916cd43dd8448eb211c80319c")
  })

  it("leaves a valid 32-char hex trace ID unchanged", () => {
    const { spans } = transformOtlpToSpans(
      {
        resourceSpans: [
          {
            resource: { attributes: [str("service.name", "test")] },
            scopeSpans: [
              {
                scope: { name: "scope", version: "1" },
                spans: [
                  {
                    traceId: "0af7651916cd43dd8448eb211c80319c",
                    spanId: "n2",
                    name: "n2",
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
      ctx,
    )
    expect(spans).toHaveLength(1)
    expect(spans[0]?.traceId).toBe("0af7651916cd43dd8448eb211c80319c")
  })

  it("rejects a span with a missing trace ID instead of crashing the batch", () => {
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
                    traceId: undefined as unknown as string,
                    spanId: "missing-trace",
                    name: "missing-trace",
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
      ctx,
    )
    expect(rejectedSpans).toBe(1)
    expect(spans).toHaveLength(0)
  })

  it("rejects a span whose trace ID is a non-string value instead of crashing the batch", () => {
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
                    traceId: { "0": "a" } as unknown as string,
                    spanId: "object-trace",
                    name: "object-trace",
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
      ctx,
    )
    expect(rejectedSpans).toBe(1)
    expect(spans).toHaveLength(0)
  })

  it("keeps processing the rest of the batch when one span has an invalid trace ID", () => {
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
                    traceId: "0af7651916cd43dd8448eb211c80319c",
                    spanId: "ok1",
                    name: "ok1",
                    startTimeUnixNano: "1710590400000000000",
                    endTimeUnixNano: "1710590401000000000",
                    attributes: [],
                    status: { code: 1 },
                  },
                  {
                    traceId: "" as unknown as string,
                    spanId: "empty-trace",
                    name: "empty-trace",
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
      ctx,
    )
    expect(rejectedSpans).toBe(1)
    expect(spans).toHaveLength(1)
    expect(spans[0]?.spanId).toBe("ok1")
  })

  it("rejects a span with a missing span ID instead of crashing the batch", () => {
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
                    traceId: "0af7651916cd43dd8448eb211c80319c",
                    spanId: undefined as unknown as string,
                    name: "missing-span",
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
      ctx,
    )
    expect(rejectedSpans).toBe(1)
    expect(spans).toHaveLength(0)
  })

  it("rejects a span whose span ID is a non-string value instead of crashing the batch", () => {
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
                    traceId: "0af7651916cd43dd8448eb211c80319c",
                    spanId: { "0": "a" } as unknown as string,
                    name: "object-span",
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
      ctx,
    )
    expect(rejectedSpans).toBe(1)
    expect(spans).toHaveLength(0)
  })

  it("keeps processing the rest of the batch when one span has an invalid span ID", () => {
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
                    traceId: "0af7651916cd43dd8448eb211c80319c",
                    spanId: "ok1",
                    name: "ok1",
                    startTimeUnixNano: "1710590400000000000",
                    endTimeUnixNano: "1710590401000000000",
                    attributes: [],
                    status: { code: 1 },
                  },
                  {
                    traceId: "0af7651916cd43dd8448eb211c80319c",
                    spanId: undefined as unknown as string,
                    name: "bad-span",
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
      ctx,
    )
    expect(rejectedSpans).toBe(1)
    expect(spans).toHaveLength(1)
    expect(spans[0]?.spanId).toBe("ok1")
  })
})

describe("transformOtlpToSpans rejects oversized trace/span IDs", () => {
  const ctx = {
    ...baseContext,
    defaultProjectId: "proj-default",
    projectIdBySlug: new Map<string, string>(),
  }

  const buildSpanWithTraceId = (
    traceId: string,
    spanId: string,
  ): NonNullable<OtlpExportTraceServiceRequest["resourceSpans"]> => [
    {
      resource: { attributes: [str("service.name", "test")] },
      scopeSpans: [
        {
          scope: { name: "scope", version: "1" },
          spans: [
            {
              traceId,
              spanId,
              name: spanId,
              startTimeUnixNano: "1710590400000000000",
              endTimeUnixNano: "1710590401000000000",
              attributes: [],
              status: { code: 1 },
            },
          ],
        },
      ],
    },
  ]

  it("rejects a trace ID longer than 32 chars", () => {
    const { spans, rejectedSpans } = transformOtlpToSpans(
      { resourceSpans: buildSpanWithTraceId(`${TRACE}extra`, "n1") },
      ctx,
    )
    expect(spans).toHaveLength(0)
    expect(rejectedSpans).toBe(1)
  })

  it("rejects a span ID longer than 16 chars", () => {
    const { spans, rejectedSpans } = transformOtlpToSpans({ resourceSpans: buildSpan("this-span-id-is-too-long") }, ctx)
    expect(spans).toHaveLength(0)
    expect(rejectedSpans).toBe(1)
  })

  it("keeps a short, arbitrary span ID unaffected", () => {
    const { spans, rejectedSpans } = transformOtlpToSpans({ resourceSpans: buildSpan("n1") }, ctx)
    expect(rejectedSpans).toBe(0)
    expect(spans).toHaveLength(1)
    expect(spans[0]?.spanId).toBe("n1")
  })

  it("rejects a 40-char hex trace ID simulating a non-conformant exporter", () => {
    const { spans, rejectedSpans } = transformOtlpToSpans(
      { resourceSpans: buildSpanWithTraceId("a".repeat(40), "n1") },
      ctx,
    )
    expect(spans).toHaveLength(0)
    expect(rejectedSpans).toBe(1)
  })
})
