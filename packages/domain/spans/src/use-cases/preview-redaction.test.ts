import {
  ChSqlClient,
  type ChSqlClientShape,
  ExternalUserId,
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
import { IDENTITY_PREVIEW_LABEL, previewRedactionUseCase } from "./preview-redaction.ts"

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

    expect(result).toMatchObject({ spansSampled: 1, spansAffected: 0, changes: [] })
  })

  it("names the field a change came from in product words, not the column name", async () => {
    const result = await run([makeSpan({ toolOutput: `mail ${EMAIL}` })], policyWith())

    expect(result.spansAffected).toBe(1)
    expect(result.changes[0]).toMatchObject({ location: "Tool output", spans: 1 })
  })

  it("shows the value before and the placeholder after", async () => {
    const result = await run([makeSpan({ toolOutput: `mail ${EMAIL}` })], policyWith())

    expect(result.changes[0]?.before).toContain(EMAIL)
    expect(result.changes[0]?.after).toContain("[REDACTED_EMAIL]")
    expect(result.changes[0]?.after).not.toContain(EMAIL)
  })

  /**
   * The screenshot this shape replaced listed one row per span per field, so a single identity
   * substitution across fifty spans filled the panel with fifty copies of one pair.
   */
  it("collapses the same change across many spans into one row with a count", async () => {
    const spans = Array.from({ length: 8 }, (_, index) =>
      makeSpan({ spanId: SpanId(String(index).padStart(16, "0")), toolOutput: `mail ${EMAIL}` }),
    )
    const result = await run(spans, policyWith())

    expect(result.spansAffected).toBe(8)
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]?.spans).toBe(8)
  })

  it("orders changes by how many spans carry them", async () => {
    const spans = [
      makeSpan({ spanId: SpanId("a".repeat(16)), toolOutput: `rare ${EMAIL}` }),
      ...Array.from({ length: 3 }, (_, index) =>
        makeSpan({ spanId: SpanId(String(index).padStart(16, "0")), statusMessage: `common ${EMAIL}` }),
      ),
    ]
    const result = await run(spans, policyWith())

    expect(result.changes[0]).toMatchObject({ location: "Status message", spans: 3 })
  })

  /**
   * An attribute map compared as one serialized blob produced a 300-character JSON diff where the
   * real change was a single key, which is what made the old panel unreadable.
   */
  it("names the attribute key that changed rather than dumping the map", async () => {
    const attrString = { "acme.note": `ref ${EMAIL}`, "gen_ai.request.model": "gpt-4" }
    const result = await run([makeSpan({ attrString })], policyWith())

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toMatchObject({ location: "Attributes", key: "acme.note" })
    expect(result.changes[0]?.before).not.toContain("gen_ai.request.model")
  })

  it("previews a custom rule under its own label", async () => {
    const rule: RedactionRule = { id: "r", label: "ACCOUNT_NUMBER", kind: "terms", terms: [ACCOUNT] }
    const result = await run([makeSpan({ attrString: { "acme.note": `ref ${ACCOUNT}` } })], policyWith([rule]))

    expect(result.labels).toEqual(expect.arrayContaining([{ label: "ACCOUNT_NUMBER", matches: 1 }]))
  })

  /**
   * The most useful thing the preview can say right after someone writes a rule, and it is absent
   * from the engine's counts, which only carry what it found.
   */
  it("reports an enabled rule that matched nothing as zero", async () => {
    const rule: RedactionRule = { id: "r", label: "ACCOUNT_NUMBER", kind: "terms", terms: ["NEVER-APPEARS"] }
    const result = await run([makeSpan({ toolOutput: "clean" })], policyWith([rule]))

    expect(result.labels).toEqual(expect.arrayContaining([{ label: "ACCOUNT_NUMBER", matches: 0 }]))
  })

  it("leaves a disabled rule out of the summary entirely", async () => {
    const rule: RedactionRule = { id: "r", label: "OFF_RULE", kind: "terms", terms: [ACCOUNT], enabled: false }
    const result = await run([makeSpan()], policyWith([rule]))

    expect(result.labels.map((entry) => entry.label)).not.toContain("OFF_RULE")
  })

  /**
   * Identity handling is counted separately by the engine, so it was missing from the summary
   * entirely — on a project that only pseudonymizes, that left the summary empty while the panel
   * filled with changes.
   */
  it("counts identity replacements in the summary", async () => {
    const pseudonymize = resolveRedactionPolicy({
      organization: null,
      project: { redaction: { mode: "enforce", identities: "pseudonymize" } },
    })
    const spans = [
      makeSpan({ userId: ExternalUserId("user-1") }),
      makeSpan({ spanId: SpanId("b".repeat(16)), userId: ExternalUserId("user-1") }),
    ]
    const result = await run(spans, pseudonymize)

    expect(result.labels).toEqual(expect.arrayContaining([{ label: IDENTITY_PREVIEW_LABEL, matches: 2 }]))
  })

  it("omits the identity row when identifiers are kept", async () => {
    const result = await run([makeSpan({ userId: ExternalUserId("user-1") })], policyWith())

    expect(result.labels.map((entry) => entry.label)).not.toContain(IDENTITY_PREVIEW_LABEL)
  })

  it("previews a key rule as a change to the named attribute", async () => {
    const rule: RedactionRule = { id: "r", label: "STAFF_ID", kind: "attribute_key", keys: ["acme.staff.id"] }
    const result = await run([makeSpan({ attrString: { "acme.staff.id": "staff-77" } })], policyWith([rule]))

    expect(result.changes[0]).toMatchObject({ location: "Attributes", key: "acme.staff.id" })
    expect(result.changes[0]?.after).toBe("[REDACTED_STAFF_ID]")
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
   * on the first difference is what keeps the row readable.
   */
  it("anchors the excerpt on the change rather than the start of a long field", async () => {
    const padding = "x".repeat(4_000)
    const result = await run([makeSpan({ toolOutput: `${padding} mail ${EMAIL}` })], policyWith())
    const change = result.changes[0]

    expect(change?.before).toContain(EMAIL)
    expect(change?.before.startsWith("…")).toBe(true)
    expect(change?.before.length).toBeLessThan(200)
  })

  it("caps how many distinct changes it returns", async () => {
    const spans = Array.from({ length: 40 }, (_, index) =>
      makeSpan({ spanId: SpanId(String(index).padStart(16, "0")), toolOutput: `mail user${index}@example.com` }),
    )
    const result = await run(spans, policyWith())

    expect(result.spansAffected).toBe(40)
    expect(result.changes.length).toBeLessThanOrEqual(25)
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
