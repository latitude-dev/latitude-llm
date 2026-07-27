import {
  ExternalUserId,
  OrganizationId,
  ProjectId,
  type ResolvedRedactionPolicy,
  resolveRedactionPolicy,
  SessionId,
  SimulationId,
  SpanId,
  TraceId,
} from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { SpanDetail } from "../entities/span.ts"
import { REDACTION_MAX_FIELD_CHARS } from "./labels.ts"
import { redactSpans } from "./redact-spans.ts"

const ORG = OrganizationId("org-1")
const PROJECT = "proj-1"
const OTHER_PROJECT = "proj-2"

const makeSpan = (overrides: Partial<SpanDetail> = {}): SpanDetail => ({
  organizationId: ORG,
  projectId: ProjectId(PROJECT),
  sessionId: SessionId("sess-1"),
  userId: ExternalUserId(""),
  userEmail: "",
  traceId: TraceId("t".repeat(32)),
  spanId: SpanId("s".repeat(16)),
  parentSpanId: "",
  apiKeyId: "key-1",
  simulationId: SimulationId(""),
  startTime: new Date("2026-01-01T00:00:00Z"),
  endTime: new Date("2026-01-01T00:00:01Z"),
  name: "chat",
  serviceName: "svc",
  kind: "client",
  statusCode: "ok",
  statusMessage: "",
  traceFlags: 0,
  traceState: "",
  errorType: "",
  tags: [],
  metadata: {},
  eventsJson: "",
  linksJson: "",
  operation: "chat",
  provider: "openai",
  model: "gpt-4",
  responseModel: "gpt-4",
  toolName: "",
  agentName: "",
  toolNames: [],
  toolCallId: "",
  tokensInput: 0,
  tokensOutput: 0,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
  tokensReasoning: 0,
  costInputMicrocents: 0,
  costOutputMicrocents: 0,
  costTotalMicrocents: 0,
  costIsEstimated: false,
  timeToFirstTokenNs: 0,
  isStreaming: false,
  responseId: "",
  finishReasons: [],
  attrString: {},
  attrInt: {},
  attrFloat: {},
  attrBool: {},
  resourceString: {},
  scopeName: "scope",
  scopeVersion: "1",
  ingestedAt: new Date("2026-01-01T00:00:02Z"),
  inputMessages: [],
  outputMessages: [],
  systemInstructions: [],
  toolDefinitions: [],
  toolInput: "",
  toolOutput: "",
  ...overrides,
})

const policy = (mode: "enforce" | "dryRun", extra: Record<string, unknown> = {}): ResolvedRedactionPolicy =>
  resolveRedactionPolicy({ organization: null, project: { redaction: { mode, ...extra } } })

const run = (input: Parameters<typeof redactSpans>[0]) => Effect.runPromise(redactSpans(input))

const enforceFor = (projectId = PROJECT) => new Map([[projectId, policy("enforce")]])

const textMessage = (content: string) => [{ role: "user", parts: [{ type: "text", content }] }]

describe("redactSpans", () => {
  it("returns the identical span array when no project has a policy", async () => {
    const spans = [makeSpan({ inputMessages: textMessage("mail john@example.com") as never })]
    const result = await run({ spans, organizationId: ORG, policyByProjectId: new Map(), pseudonymSecret: undefined })

    expect(result.spans).toBe(spans)
    expect(result.summary.enforceSpans).toBe(0)
  })

  it("leaves a span whose project is absent from the policy map byte-identical", async () => {
    const untouched = makeSpan({
      projectId: ProjectId(OTHER_PROJECT),
      inputMessages: textMessage("mail john@example.com") as never,
    })
    const result = await run({
      spans: [untouched],
      organizationId: ORG,
      policyByProjectId: enforceFor(),
      pseudonymSecret: undefined,
    })

    expect(result.spans[0]).toBe(untouched)
    expect(result.summary.enforceSpans).toBe(0)
  })

  it("redacts content of an opted-in project only, in a mixed batch", async () => {
    const optedIn = makeSpan({ inputMessages: textMessage("mail john@example.com") as never })
    const optedOut = makeSpan({
      projectId: ProjectId(OTHER_PROJECT),
      inputMessages: textMessage("mail john@example.com") as never,
    })
    const result = await run({
      spans: [optedIn, optedOut],
      organizationId: ORG,
      policyByProjectId: enforceFor(),
      pseudonymSecret: undefined,
    })

    expect(JSON.stringify(result.spans[0]?.inputMessages)).toContain("[REDACTED_EMAIL]")
    expect(JSON.stringify(result.spans[1]?.inputMessages)).toContain("john@example.com")
    expect(result.summary.enforceSpans).toBe(1)
  })

  it("redacts every content field of the span surface", async () => {
    const span = makeSpan({
      inputMessages: textMessage("in john@example.com") as never,
      outputMessages: textMessage("out john@example.com") as never,
      systemInstructions: [{ type: "text", content: "sys john@example.com" }] as never,
      toolDefinitions: [{ name: "send", description: "to john@example.com", parameters: {} }],
      toolInput: '{"to":"john@example.com"}',
      toolOutput: "sent to john@example.com",
      statusMessage: "failed for john@example.com",
      eventsJson: '[{"name":"ev","attributes":{"note":"john@example.com"}}]',
      resourceString: { "host.name": "john@example.com" },
    })
    const [redacted] = (
      await run({
        spans: [span],
        organizationId: ORG,
        policyByProjectId: enforceFor(),
        pseudonymSecret: undefined,
      })
    ).spans

    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain("john@example.com")
    expect(redacted?.statusMessage).toBe("failed for [REDACTED_EMAIL]")
    expect(redacted?.toolOutput).toBe("sent to [REDACTED_EMAIL]")
    expect(redacted?.resourceString["host.name"]).toBe("[REDACTED_EMAIL]")
  })

  it("drops content attribute keys from attr_string so no plaintext copy survives", async () => {
    const span = makeSpan({
      attrString: {
        "gen_ai.input.messages": '[{"role":"user","parts":[{"type":"text","content":"john@example.com"}]}]',
        "gen_ai.prompt.0.content": "john@example.com",
        "gen_ai.request.model": "gpt-4",
      },
    })
    const [redacted] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: enforceFor(), pseudonymSecret: undefined })
    ).spans

    expect(Object.keys(redacted?.attrString ?? {})).toEqual(["gen_ai.request.model"])
    expect(JSON.stringify(redacted?.attrString)).not.toContain("john@example.com")
  })

  it("value-redacts attributes whose keys are not known content keys", async () => {
    const span = makeSpan({ attrString: { "vendor.unknown.payload": "mail john@example.com" } })
    const [redacted] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: enforceFor(), pseudonymSecret: undefined })
    ).spans

    expect(redacted?.attrString["vendor.unknown.payload"]).toBe("mail [REDACTED_EMAIL]")
  })

  it("counts dropped attribute keys", async () => {
    const span = makeSpan({
      attrString: { "gen_ai.input.messages": "x", "gen_ai.output.messages": "y", "gen_ai.request.model": "gpt-4" },
    })
    const result = await run({
      spans: [span],
      organizationId: ORG,
      policyByProjectId: enforceFor(),
      pseudonymSecret: undefined,
    })

    expect(result.summary.droppedAttributeKeys).toBe(2)
  })

  it("leaves metadata and tags alone by default", async () => {
    const span = makeSpan({ metadata: { note: "john@example.com" }, tags: ["john@example.com"] })
    const [redacted] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: enforceFor(), pseudonymSecret: undefined })
    ).spans

    expect(redacted?.metadata.note).toBe("john@example.com")
    expect(redacted?.tags).toEqual(["john@example.com"])
  })

  it("redacts metadata and tags when the scope is enabled, preserving metadata keys", async () => {
    const span = makeSpan({ metadata: { "user.note": "john@example.com" }, tags: ["john@example.com", "prod"] })
    const [redacted] = (
      await run({
        spans: [span],
        organizationId: ORG,
        policyByProjectId: new Map([[PROJECT, policy("enforce", { scopes: { metadata: true } })]]),
        pseudonymSecret: undefined,
      })
    ).spans

    expect(redacted?.metadata).toEqual({ "user.note": "[REDACTED_EMAIL]" })
    expect(redacted?.tags).toEqual(["[REDACTED_EMAIL]", "prod"])
  })

  it("aggregates match counts per entity across the batch", async () => {
    const spans = [
      makeSpan({ toolOutput: "john@example.com" }),
      makeSpan({ toolOutput: "jane@example.com +14155552671" }),
    ]
    const result = await run({
      spans,
      organizationId: ORG,
      policyByProjectId: enforceFor(),
      pseudonymSecret: undefined,
    })

    expect(result.summary.counts).toEqual({ email: 2, phone: 1 })
  })
})

describe("redactSpans dry run", () => {
  const dryRunFor = () => new Map([[PROJECT, policy("dryRun")]])

  it("does not modify content", async () => {
    const span = makeSpan({ toolOutput: "mail john@example.com", statusMessage: "john@example.com" })
    const [result] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: dryRunFor(), pseudonymSecret: undefined })
    ).spans

    expect(result?.toolOutput).toBe("mail john@example.com")
    expect(result?.statusMessage).toBe("john@example.com")
  })

  it("does not drop content attribute keys", async () => {
    const span = makeSpan({ attrString: { "gen_ai.input.messages": "john@example.com" } })
    const [result] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: dryRunFor(), pseudonymSecret: undefined })
    ).spans

    expect(result?.attrString["gen_ai.input.messages"]).toBe("john@example.com")
  })

  it("still reports what enforce would have removed", async () => {
    const span = makeSpan({ toolOutput: "john@example.com +14155552671" })
    const dry = await run({
      spans: [span],
      organizationId: ORG,
      policyByProjectId: dryRunFor(),
      pseudonymSecret: undefined,
    })
    const enforced = await run({
      spans: [span],
      organizationId: ORG,
      policyByProjectId: enforceFor(),
      pseudonymSecret: undefined,
    })

    expect(dry.summary.counts).toEqual(enforced.summary.counts)
    expect(dry.summary.dryRunSpans).toBe(1)
    expect(dry.summary.enforceSpans).toBe(0)
  })

  it("still reports the attribute keys enforce would drop", async () => {
    const span = makeSpan({ attrString: { "gen_ai.input.messages": "x" } })
    const result = await run({
      spans: [span],
      organizationId: ORG,
      policyByProjectId: dryRunFor(),
      pseudonymSecret: undefined,
    })

    expect(result.summary.droppedAttributeKeys).toBe(1)
  })

  it("does not pseudonymize identities", async () => {
    const span = makeSpan({ userEmail: "john@example.com", userId: ExternalUserId("u-1") })
    const [result] = (
      await run({
        spans: [span],
        organizationId: ORG,
        policyByProjectId: new Map([[PROJECT, policy("dryRun", { identities: "pseudonymize" })]]),
        pseudonymSecret: "secret",
      })
    ).spans

    expect(result?.userEmail).toBe("john@example.com")
  })
})

describe("redactSpans identity handling", () => {
  const pseudonymizeFor = () => new Map([[PROJECT, policy("enforce", { identities: "pseudonymize" })]])

  it("keeps identities by default", async () => {
    const span = makeSpan({ userEmail: "john@example.com", userId: ExternalUserId("u-1") })
    const [result] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: enforceFor(), pseudonymSecret: "secret" })
    ).spans

    expect(result?.userEmail).toBe("john@example.com")
    expect(result?.userId).toBe("u-1")
  })

  it("replaces identities with a stable prefixed digest", async () => {
    const span = makeSpan({ userEmail: "john@example.com", userId: ExternalUserId("u-1") })
    const [result] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: pseudonymizeFor(), pseudonymSecret: "secret" })
    ).spans

    expect(result?.userEmail).toMatch(/^anon_[0-9a-f]{16}$/)
    expect(result?.userId).toMatch(/^anon_[0-9a-f]{16}$/)
  })

  it("is deterministic, so equality filters and group-bys keep working", async () => {
    const spans = [
      makeSpan({ userEmail: "john@example.com" }),
      makeSpan({ userEmail: "john@example.com" }),
      makeSpan({ userEmail: "jane@example.com" }),
    ]
    const result = await run({
      spans,
      organizationId: ORG,
      policyByProjectId: pseudonymizeFor(),
      pseudonymSecret: "secret",
    })

    expect(result.spans[0]?.userEmail).toBe(result.spans[1]?.userEmail)
    expect(result.spans[0]?.userEmail).not.toBe(result.spans[2]?.userEmail)
  })

  it("produces different pseudonyms per organization, preventing cross-tenant correlation", async () => {
    const forOrg = async (organizationId: OrganizationId) =>
      (
        await run({
          spans: [makeSpan({ organizationId, userEmail: "john@example.com" })],
          organizationId,
          policyByProjectId: pseudonymizeFor(),
          pseudonymSecret: "secret",
        })
      ).spans[0]?.userEmail

    expect(await forOrg(OrganizationId("org-1"))).not.toBe(await forOrg(OrganizationId("org-2")))
  })

  it("leaves empty identities empty rather than inventing a user", async () => {
    const [result] = (
      await run({
        spans: [makeSpan()],
        organizationId: ORG,
        policyByProjectId: pseudonymizeFor(),
        pseudonymSecret: "secret",
      })
    ).spans

    expect(result?.userEmail).toBe("")
    expect(result?.userId).toBe("")
    expect(
      (
        await run({
          spans: [makeSpan()],
          organizationId: ORG,
          policyByProjectId: pseudonymizeFor(),
          pseudonymSecret: "s",
        })
      ).summary.pseudonymizedIdentities,
    ).toBe(0)
  })

  it("degrades to full redaction when no secret is configured, never to plaintext", async () => {
    const span = makeSpan({ userEmail: "john@example.com", userId: ExternalUserId("u-1") })
    const result = await run({
      spans: [span],
      organizationId: ORG,
      policyByProjectId: pseudonymizeFor(),
      pseudonymSecret: undefined,
    })

    expect(result.spans[0]?.userEmail).toBe("[REDACTED_USER]")
    expect(result.spans[0]?.userId).toBe("[REDACTED_USER]")
    expect(result.summary.identityFallback).toBe(true)
  })

  it("counts each replaced identity", async () => {
    const span = makeSpan({ userEmail: "john@example.com", userId: ExternalUserId("u-1") })
    const result = await run({
      spans: [span],
      organizationId: ORG,
      policyByProjectId: pseudonymizeFor(),
      pseudonymSecret: "secret",
    })

    expect(result.summary.pseudonymizedIdentities).toBe(2)
  })
})

describe("redactSpans size cap", () => {
  const oversized = `${"a".repeat(REDACTION_MAX_FIELD_CHARS + 1)} john@example.com`

  it("replaces an oversized leaf wholesale rather than leaving it unscanned", async () => {
    const result = await run({
      spans: [makeSpan({ toolOutput: oversized })],
      organizationId: ORG,
      policyByProjectId: enforceFor(),
      pseudonymSecret: undefined,
    })

    expect(result.spans[0]?.toolOutput).toBe("[REDACTED_OVERSIZED_FIELD]")
    expect(result.summary.oversizedFields).toBe(1)
  })

  it("counts an oversized leaf in dry run without replacing it", async () => {
    const result = await run({
      spans: [makeSpan({ toolOutput: oversized })],
      organizationId: ORG,
      policyByProjectId: new Map([[PROJECT, policy("dryRun")]]),
      pseudonymSecret: undefined,
    })

    expect(result.spans[0]?.toolOutput).toBe(oversized)
    expect(result.summary.oversizedFields).toBe(1)
  })

  it("scans a field just under the cap normally", async () => {
    const underCap = `${"a".repeat(1_000)} john@example.com`
    const result = await run({
      spans: [makeSpan({ toolOutput: underCap })],
      organizationId: ORG,
      policyByProjectId: enforceFor(),
      pseudonymSecret: undefined,
    })

    expect(result.spans[0]?.toolOutput).toContain("[REDACTED_EMAIL]")
    expect(result.summary.oversizedFields).toBe(0)
  })
})

describe("redactSpans deadline", () => {
  const spans = [makeSpan({ toolOutput: "mail john@example.com" }), makeSpan({ spanId: SpanId("b".repeat(16)) })]

  it("fails closed when the batch budget is already spent", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(
        redactSpans({
          spans,
          organizationId: ORG,
          policyByProjectId: enforceFor(),
          pseudonymSecret: undefined,
          timeoutMs: 0,
        }),
      ),
    )

    expect(failure._tag).toBe("RedactionError")
    expect(failure.reason).toBe("redaction pass exceeded its deadline")
  })

  it("completes normally within the default budget", async () => {
    const result = await run({
      spans,
      organizationId: ORG,
      policyByProjectId: enforceFor(),
      pseudonymSecret: undefined,
    })

    expect(result.spans[0]?.toolOutput).toBe("mail [REDACTED_EMAIL]")
  })
})
