import {
  ChSqlClient,
  type ChSqlClientShape,
  OrganizationId,
  ProjectId,
  type RedactionPolicy,
  type RedactionRule,
  resolveRedactionPolicy,
  SpanId,
} from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { SpanDetail } from "../entities/span.ts"
import { SpanRepository } from "../ports/span-repository.ts"
import { createFakeSpanRepository } from "../testing/fake-span-repository.ts"
import { previewRedactionUseCase } from "./preview-redaction.ts"

const ORG = OrganizationId("o".repeat(24))
const PROJECT = ProjectId("1".repeat(24))

const EMAIL = "victim@example.com"
const ACCOUNT = "ACME-1234"

const makeSpan = (overrides: Partial<SpanDetail> = {}): SpanDetail =>
  ({
    organizationId: ORG,
    projectId: PROJECT,
    traceId: "t".repeat(32),
    spanId: "s".repeat(16),
    userId: "",
    userEmail: "",
    statusMessage: "",
    tags: [],
    metadata: {},
    eventsJson: "",
    attrString: {},
    attrInt: {},
    attrFloat: {},
    attrBool: {},
    resourceString: {},
    inputMessages: [],
    outputMessages: [],
    systemInstructions: [],
    toolDefinitions: [],
    toolInput: "",
    toolOutput: "",
    ...overrides,
  }) as unknown as SpanDetail

const policyWith = (rules: RedactionRule[] = []): RedactionPolicy =>
  resolveRedactionPolicy({ organization: null, project: { redaction: { mode: "enforce", rules } } })

const run = (spans: SpanDetail[], policy: RedactionPolicy, sampleSize = 10) => {
  const { repository } = createFakeSpanRepository({ listRecentDetailsByProjectId: () => Effect.succeed(spans) })

  return Effect.runPromise(
    previewRedactionUseCase({ organizationId: ORG, projectId: PROJECT, policy, sampleSize }).pipe(
      Effect.provide(
        Layer.mergeAll(Layer.succeed(SpanRepository, repository), Layer.succeed(ChSqlClient, {} as ChSqlClientShape)),
      ),
    ),
  )
}

describe("previewRedactionUseCase", () => {
  it("reports nothing to do for spans the policy would not change", async () => {
    const result = await run([makeSpan({ toolOutput: "nothing sensitive" })], policyWith())

    expect(result).toMatchObject({ spansSampled: 1, spansAffected: 0, countsByLabel: {}, samples: [] })
  })

  it("counts built-in matches by label and names the field they came from", async () => {
    const result = await run([makeSpan({ toolOutput: `mail ${EMAIL}` })], policyWith())

    expect(result.spansAffected).toBe(1)
    expect(result.countsByLabel).toEqual({ EMAIL: 1 })
    expect(result.samples[0]).toMatchObject({ field: "toolOutput", spanId: "s".repeat(16) })
  })

  it("shows the value before and the placeholder after", async () => {
    const result = await run([makeSpan({ toolOutput: `mail ${EMAIL}` })], policyWith())

    expect(result.samples[0]?.before).toContain(EMAIL)
    expect(result.samples[0]?.after).toContain("[REDACTED_EMAIL]")
    expect(result.samples[0]?.after).not.toContain(EMAIL)
  })

  it("previews a custom rule under its own label", async () => {
    const rule: RedactionRule = { id: "r", label: "ACCOUNT_NUMBER", kind: "terms", terms: [ACCOUNT] }
    const result = await run([makeSpan({ attrString: { "acme.note": `ref ${ACCOUNT}` } })], policyWith([rule]))

    expect(result.countsByLabel).toEqual({ ACCOUNT_NUMBER: 1 })
    expect(result.samples[0]).toMatchObject({ field: "attrString" })
  })

  it("previews a key rule as a change to the attribute map", async () => {
    const rule: RedactionRule = { id: "r", label: "STAFF_ID", kind: "attribute_key", keys: ["acme.staff.id"] }
    const result = await run([makeSpan({ attrString: { "acme.staff.id": "staff-77" } })], policyWith([rule]))

    expect(result.spansAffected).toBe(1)
    expect(result.samples[0]?.after).not.toContain("staff-77")
  })

  it("reports every span it sampled, not only the ones it changed", async () => {
    const spans = [
      makeSpan({ toolOutput: `mail ${EMAIL}` }),
      makeSpan({ spanId: SpanId("b".repeat(16)), toolOutput: "clean" }),
    ]
    const result = await run(spans, policyWith())

    expect(result).toMatchObject({ spansSampled: 2, spansAffected: 1 })
  })

  /**
   * A multi-kilobyte tool output usually differs nowhere near its start, so anchoring the excerpt
   * on the first difference is what keeps the panel readable.
   */
  it("anchors the excerpt on the change rather than the start of a long field", async () => {
    const padding = "x".repeat(4_000)
    const result = await run([makeSpan({ toolOutput: `${padding} mail ${EMAIL}` })], policyWith())
    const sample = result.samples[0]

    expect(sample?.before).toContain(EMAIL)
    expect(sample?.before.startsWith("…")).toBe(true)
    expect(sample?.before.length).toBeLessThan(400)
  })

  it("caps how many excerpts it returns", async () => {
    const spans = Array.from({ length: 40 }, (_, index) =>
      makeSpan({ spanId: SpanId(String(index).padStart(16, "0")), toolOutput: `mail ${EMAIL}` }),
    )
    const result = await run(spans, policyWith())

    expect(result.spansAffected).toBe(40)
    expect(result.samples.length).toBeLessThanOrEqual(20)
  })

  it("never writes, whatever the policy would do", async () => {
    const { repository, inserted } = createFakeSpanRepository({
      listRecentDetailsByProjectId: () => Effect.succeed([makeSpan({ toolOutput: `mail ${EMAIL}` })]),
    })

    await Effect.runPromise(
      previewRedactionUseCase({
        organizationId: ORG,
        projectId: PROJECT,
        policy: policyWith(),
        sampleSize: 5,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(Layer.succeed(SpanRepository, repository), Layer.succeed(ChSqlClient, {} as ChSqlClientShape)),
        ),
      ),
    )

    expect(inserted).toHaveLength(0)
  })
})
