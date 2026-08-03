import {
  ExternalUserId,
  OrganizationId,
  ProjectId,
  type RedactionPolicy,
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
  costSource: "no_tokens",
  costPricedProvider: "",
  costPricedModel: "",
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

const policy = (extra: Record<string, unknown> = {}): RedactionPolicy =>
  resolveRedactionPolicy({ organization: null, project: { redaction: { mode: "enforce", ...extra } } })

const run = (input: Parameters<typeof redactSpans>[0]) => Effect.runPromise(redactSpans(input))

const enforceFor = (projectId = PROJECT) => new Map([[projectId, policy()]])

const textMessage = (content: string) => [{ role: "user", parts: [{ type: "text", content }] }]

describe("redactSpans", () => {
  it("returns the identical span array when no project has a policy", async () => {
    const spans = [makeSpan({ inputMessages: textMessage("mail john@example.com") as never })]
    const result = await run({ spans, organizationId: ORG, policyByProjectId: new Map(), pseudonymSecret: undefined })

    expect(result.spans).toBe(spans)
    expect(result.summary.redactedSpans).toBe(0)
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
    expect(result.summary.redactedSpans).toBe(0)
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
    expect(result.summary.redactedSpans).toBe(1)
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

  it("redacts content attribute values in place so no plaintext copy survives", async () => {
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

    expect(Object.keys(redacted?.attrString ?? {}).sort()).toEqual([
      "gen_ai.input.messages",
      "gen_ai.prompt.0.content",
      "gen_ai.request.model",
    ])
    expect(redacted?.attrString["gen_ai.prompt.0.content"]).toBe("[REDACTED_EMAIL]")
    expect(JSON.stringify(redacted?.attrString)).not.toContain("john@example.com")
  })

  it("value-redacts attributes from a vendor with no parser", async () => {
    const span = makeSpan({ attrString: { "vendor.unknown.payload": "mail john@example.com" } })
    const [redacted] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: enforceFor(), pseudonymSecret: undefined })
    ).spans

    expect(redacted?.attrString["vendor.unknown.payload"]).toBe("mail [REDACTED_EMAIL]")
  })

  it("keeps every attribute key it was given", async () => {
    const span = makeSpan({
      attrString: { "gen_ai.input.messages": "x", "gen_ai.output.messages": "y", "gen_ai.request.model": "gpt-4" },
    })
    const result = await run({
      spans: [span],
      organizationId: ORG,
      policyByProjectId: enforceFor(),
      pseudonymSecret: undefined,
    })

    expect(Object.keys(result.spans[0]?.attrString ?? {}).sort()).toEqual([
      "gen_ai.input.messages",
      "gen_ai.output.messages",
      "gen_ai.request.model",
    ])
    expect(result.summary.relocatedNumericAttributes).toBe(0)
  })

  it("redacts inside a JSON-valued attribute rather than flattening it", async () => {
    const span = makeSpan({
      attrString: {
        "gen_ai.input.messages": JSON.stringify([
          { role: "user", parts: [{ type: "text", content: "mail john@example.com" }] },
        ]),
      },
    })
    const [redacted] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: enforceFor(), pseudonymSecret: undefined })
    ).spans
    const parsed = JSON.parse(redacted?.attrString["gen_ai.input.messages"] ?? "[]")

    expect(parsed[0].parts[0].content).toBe("mail [REDACTED_EMAIL]")
    expect(parsed[0].role).toBe("user")
  })

  it("leaves booleans and unmatched numbers in their own maps", async () => {
    const span = makeSpan({
      attrInt: { "gen_ai.usage.input_tokens": 215813 },
      attrBool: { "gen_ai.request.stream": true },
    })
    const [redacted] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: enforceFor(), pseudonymSecret: undefined })
    ).spans

    expect(redacted?.attrInt).toEqual({ "gen_ai.usage.input_tokens": 215813 })
    expect(redacted?.attrBool).toEqual({ "gen_ai.request.stream": true })
    expect(redacted?.attrString).toEqual({})
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
        policyByProjectId: new Map([[PROJECT, policy({ scopes: { metadata: true } })]]),
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

describe("redactSpans identity handling", () => {
  const pseudonymizeFor = () => new Map([[PROJECT, policy({ identities: "pseudonymize" })]])

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

  it("pseudonymizes the attribute the identity column was resolved from", async () => {
    const span = makeSpan({
      userEmail: "devin@example.com",
      userId: ExternalUserId("usr_devin_hartley"),
      attrString: { "user.id": "usr_devin_hartley", "user.email": "devin@example.com" },
    })
    const [result] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: pseudonymizeFor(), pseudonymSecret: "secret" })
    ).spans

    expect(result?.attrString["user.id"]).toBe(result?.userId)
    expect(result?.attrString["user.id"]).toMatch(/^anon_[0-9a-f]{16}$/)
  })

  it("gives the identity email the pseudonym, not the email placeholder, so the row agrees with itself", async () => {
    const span = makeSpan({
      userEmail: "devin@example.com",
      attrString: { "user.email": "devin@example.com" },
    })
    const [result] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: pseudonymizeFor(), pseudonymSecret: "secret" })
    ).spans

    expect(result?.attrString["user.email"]).toBe(result?.userEmail)
    expect(result?.attrString["user.email"]).not.toBe("[REDACTED_EMAIL]")
  })

  it("covers every vendor spelling of the identity attribute, not just the one that resolved", async () => {
    const span = makeSpan({
      userId: ExternalUserId("usr_devin_hartley"),
      attrString: {
        "user.id": "usr_devin_hartley",
        "langfuse.user.id": "usr_devin_hartley",
        "traceloop.association.properties.user_id": "usr_devin_hartley",
        "our.own.customer_ref": "usr_devin_hartley",
      },
    })
    const [result] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: pseudonymizeFor(), pseudonymSecret: "secret" })
    ).spans

    expect(Object.values(result?.attrString ?? {})).toEqual(Array(4).fill(result?.userId))
  })

  it("pseudonymizes the identity in resource attributes", async () => {
    const span = makeSpan({
      userId: ExternalUserId("usr_devin_hartley"),
      resourceString: { "enduser.id": "usr_devin_hartley" },
    })
    const [result] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: pseudonymizeFor(), pseudonymSecret: "secret" })
    ).spans

    expect(result?.resourceString["enduser.id"]).toBe(result?.userId)
  })

  it("pseudonymizes the identity in metadata and tags even when the metadata scope is off", async () => {
    const span = makeSpan({
      userId: ExternalUserId("usr_devin_hartley"),
      metadata: { user_id: "usr_devin_hartley", plan: "pro" },
      tags: ["usr_devin_hartley", "beta"],
    })
    const [result] = (
      await run({
        spans: [span],
        organizationId: ORG,
        policyByProjectId: new Map([[PROJECT, policy({ identities: "pseudonymize", scopes: { metadata: false } })]]),
        pseudonymSecret: "secret",
      })
    ).spans

    expect(result?.metadata).toEqual({ user_id: result?.userId, plan: "pro" })
    expect(result?.tags).toEqual([result?.userId, "beta"])
  })

  it("degrades the identity attribute to the placeholder when no secret is configured", async () => {
    const span = makeSpan({
      userId: ExternalUserId("usr_devin_hartley"),
      attrString: { "user.id": "usr_devin_hartley" },
    })
    const [result] = (
      await run({
        spans: [span],
        organizationId: ORG,
        policyByProjectId: pseudonymizeFor(),
        pseudonymSecret: undefined,
      })
    ).spans

    expect(result?.attrString["user.id"]).toBe("[REDACTED_USER]")
  })

  it("leaves identity attributes alone when identities are kept", async () => {
    const span = makeSpan({
      userId: ExternalUserId("usr_devin_hartley"),
      attrString: { "user.id": "usr_devin_hartley" },
    })
    const [result] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: enforceFor(), pseudonymSecret: "secret" })
    ).spans

    expect(result?.attrString["user.id"]).toBe("usr_devin_hartley")
  })

  it("matches whole values only, so a short user id cannot corrupt an unrelated attribute", async () => {
    const span = makeSpan({
      userId: ExternalUserId("4"),
      attrString: { "user.id": "4", "gen_ai.request.model": "gpt-4" },
    })
    const [result] = (
      await run({ spans: [span], organizationId: ORG, policyByProjectId: pseudonymizeFor(), pseudonymSecret: "secret" })
    ).spans

    expect(result?.attrString["gen_ai.request.model"]).toBe("gpt-4")
    expect(result?.attrString["user.id"]).toBe(result?.userId)
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
