import {
  OrganizationId,
  type RedactionRule,
  type ResolvedRedactionPolicy,
  resolveRedactionPolicy,
} from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { TransformContext } from "../otlp/transform.ts"
import { transformOtlpToSpans } from "../otlp/transform.ts"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue, OtlpSpan } from "../otlp/types.ts"
import { redactSpans } from "./redact-spans.ts"

/**
 * Runs the real transform, because a hand-built span cannot catch the leak these tests exist for:
 * `transformSpan` copies every raw content attribute into `attr_string` next to the parsed columns.
 */

const ORG = OrganizationId("org_test")
const PROJECT = "proj_test"

const EMAIL = "victim@example.com"
const PHONE = "+14155552671"
const CARD = "4111111111111111"
/** 19-digit Visa: Luhn-valid and past 2^53, so `Number` would round its last digits away. */
const LONG_CARD = "4111111111111111110"
// Split so no contiguous vendor-key literal sits in the file; secret scanners match on that shape.
const SECRET = `${"sk-proj-"}abc123DEF456ghi789JKL012mno345PQR678stu`

const str = (key: string, value: string): OtlpKeyValue => ({ key, value: { stringValue: value } })
const int = (key: string, value: string): OtlpKeyValue => ({ key, value: { intValue: value } })

const CONTEXT: TransformContext = {
  organizationId: ORG,
  apiKeyId: "key_test",
  ingestedAt: new Date("2026-03-16T12:00:00Z"),
  defaultProjectId: PROJECT,
  projectIdBySlug: new Map(),
}

const buildRequest = (attributes: OtlpKeyValue[], events?: OtlpSpan["events"]): OtlpExportTraceServiceRequest => ({
  resourceSpans: [
    {
      resource: { attributes: [str("service.name", "my-app")] },
      scopeSpans: [
        {
          scope: { name: "test.instrumentation", version: "1.0.0" },
          spans: [
            {
              traceId: "0af7651916cd43dd8448eb211c80319c",
              spanId: "a1b2c3d4e5f60001",
              name: "chat",
              kind: 3,
              startTimeUnixNano: "1710590400000000000",
              endTimeUnixNano: "1710590401000000000",
              attributes,
              ...(events ? { events } : {}),
            },
          ],
        },
      ],
    },
  ],
})

const ENFORCE: ReadonlyMap<string, ResolvedRedactionPolicy> = new Map([
  [PROJECT, resolveRedactionPolicy({ organization: null, project: { redaction: { mode: "enforce" } } })],
])

const transformAndRedact = async (request: OtlpExportTraceServiceRequest) => {
  const { spans } = transformOtlpToSpans(request, CONTEXT)
  expect(spans).toHaveLength(1)

  const result = await Effect.runPromise(
    redactSpans({ spans, organizationId: ORG, policyByProjectId: ENFORCE, pseudonymSecret: undefined }),
  )

  return { before: JSON.stringify(spans[0]), after: JSON.stringify(result.spans[0]), summary: result.summary }
}

const VENDOR_PAYLOADS: [string, OtlpKeyValue[]][] = [
  [
    "genai current",
    [
      str("gen_ai.system", "openai"),
      str(
        "gen_ai.input.messages",
        JSON.stringify([{ role: "user", parts: [{ type: "text", content: `contact ${EMAIL}` }] }]),
      ),
      str(
        "gen_ai.output.messages",
        JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: `card ${CARD}` }] }]),
      ),
      str("gen_ai.system_instructions", JSON.stringify([{ type: "text", content: `admin ${EMAIL}` }])),
    ],
  ],
  [
    "genai deprecated indexed",
    [
      str("gen_ai.system", "openai"),
      str("gen_ai.prompt.0.role", "user"),
      str("gen_ai.prompt.0.content", `call me at ${PHONE}`),
      str("gen_ai.completion.0.role", "assistant"),
      str("gen_ai.completion.0.content", `mailing ${EMAIL}`),
    ],
  ],
  [
    "openinference",
    [
      str("openinference.span.kind", "LLM"),
      str("llm.input_messages.0.message.role", "user"),
      str("llm.input_messages.0.message.content", `my card is ${CARD}`),
      str("llm.output_messages.0.message.role", "assistant"),
      str("llm.output_messages.0.message.content", `noted ${EMAIL}`),
    ],
  ],
  [
    "vercel ai sdk",
    [
      str("ai.prompt", JSON.stringify({ messages: [{ role: "user", content: `reach ${EMAIL}` }] })),
      str("ai.response.text", `token ${SECRET}`),
    ],
  ],
  [
    "livekit",
    [
      str("lk.chat_ctx", JSON.stringify({ items: [{ role: "user", content: [`ring ${PHONE}`] }] })),
      str("lk.response.text", `emailed ${EMAIL}`),
    ],
  ],
  ["claude code", [str("user_prompt", `refactor and email ${EMAIL}`), str("session.id", "sess-1")]],
  [
    "json value",
    [str("input.value", JSON.stringify({ prompt: `ship to ${EMAIL}` })), str("output.value", `done ${PHONE}`)],
  ],
]

describe("redaction over the real OTLP transform", () => {
  it.each(VENDOR_PAYLOADS)("leaves no plaintext anywhere in a %s span", async (_vendor, attributes) => {
    const { before, after } = await transformAndRedact(buildRequest(attributes))

    // Guard against a vacuous pass: the payload must have contained PII to begin with.
    expect([EMAIL, PHONE, CARD, SECRET].some((pii) => before.includes(pii))).toBe(true)

    expect(after).not.toContain(EMAIL)
    expect(after).not.toContain(PHONE)
    expect(after).not.toContain(CARD)
    expect(after).not.toContain(SECRET)
  })

  it("redacts the raw attribute copy in place instead of deleting the key", async () => {
    const attributes = [
      str("gen_ai.system", "openai"),
      str(
        "gen_ai.input.messages",
        JSON.stringify([{ role: "user", parts: [{ type: "text", content: `contact ${EMAIL}` }] }]),
      ),
    ]
    const { spans } = transformOtlpToSpans(buildRequest(attributes), CONTEXT)

    expect(spans[0]?.attrString["gen_ai.input.messages"]).toContain(EMAIL)
    expect(JSON.stringify(spans[0]?.inputMessages)).toContain(EMAIL)

    const result = await Effect.runPromise(
      redactSpans({ spans, organizationId: ORG, policyByProjectId: ENFORCE, pseudonymSecret: undefined }),
    )
    const attrString = result.spans[0]?.attrString

    expect(attrString).toHaveProperty("gen_ai.input.messages")
    expect(attrString?.["gen_ai.input.messages"]).toContain("[REDACTED_EMAIL]")
    expect(JSON.stringify(result.spans[0])).not.toContain(EMAIL)
  })

  it("keeps conversation prose no detector matches, exactly as the parsed column does", async () => {
    const prose = "Margaret Hale lives on Crampton Terrace and prefers afternoon appointments"
    const attributes = [
      str("gen_ai.system", "openai"),
      str("gen_ai.input.messages", JSON.stringify([{ role: "user", parts: [{ type: "text", content: prose }] }])),
    ]
    const { spans } = transformOtlpToSpans(buildRequest(attributes), CONTEXT)

    const result = await Effect.runPromise(
      redactSpans({ spans, organizationId: ORG, policyByProjectId: ENFORCE, pseudonymSecret: undefined }),
    )

    // Redaction removes what a detector matches, not the payload; both copies keep the prose.
    expect(JSON.stringify(result.spans[0]?.attrString)).toContain(prose)
    expect(JSON.stringify(result.spans[0]?.inputMessages)).toContain(prose)
  })

  it("keeps content attributes belonging to a parser that never ran", async () => {
    const attributes = [
      str("gen_ai.system", "openai"),
      str("llm.input_messages.0.message.role", "user"),
      str("llm.input_messages.0.message.content", `contact ${EMAIL}`),
      // Read by the json-value parser, which openinference outranks — so nothing promotes it to a column.
      str("output.value", JSON.stringify({ note: `reach me on ${PHONE}` })),
    ]
    const { spans } = transformOtlpToSpans(buildRequest(attributes), CONTEXT)

    const result = await Effect.runPromise(
      redactSpans({ spans, organizationId: ORG, policyByProjectId: ENFORCE, pseudonymSecret: undefined }),
    )
    const attrString = result.spans[0]?.attrString

    expect(attrString).toHaveProperty("output.value")
    expect(attrString?.["output.value"]).toContain("[REDACTED_PHONE]")
    expect(JSON.stringify(result.spans[0])).not.toContain(PHONE)
  })

  it("moves a numeric attribute a detector matched into attrString as a placeholder", async () => {
    const attributes = [
      str("gen_ai.system", "openai"),
      int("billing.card", CARD),
      int("gen_ai.usage.input_tokens", "215813"),
      int("event.timestamp_ms", "1785506507050"),
    ]
    const { spans } = transformOtlpToSpans(buildRequest(attributes), CONTEXT)

    const result = await Effect.runPromise(
      redactSpans({ spans, organizationId: ORG, policyByProjectId: ENFORCE, pseudonymSecret: undefined }),
    )
    const redacted = result.spans[0]

    expect(redacted?.attrInt).not.toHaveProperty("billing.card")
    expect(redacted?.attrString["billing.card"]).toBe("[REDACTED_CREDIT_CARD]")
    // Neither a token count nor a millisecond timestamp carries a card issuer prefix.
    expect(redacted?.attrInt["gen_ai.usage.input_tokens"]).toBe(215813)
    expect(redacted?.attrInt["event.timestamp_ms"]).toBe(1785506507050)
    expect(result.summary.relocatedNumericAttributes).toBe(1)
  })

  // A 19-digit card exceeds 2^53, so `Number` would round its digits away before any detector saw them.
  it("redacts an oversized card sent as an integer, which never reaches attrInt", async () => {
    const attributes = [str("gen_ai.system", "openai"), int("billing.card", LONG_CARD)]
    const { spans } = transformOtlpToSpans(buildRequest(attributes), CONTEXT)

    expect(spans[0]?.attrString["billing.card"]).toBe(LONG_CARD)
    expect(spans[0]?.attrInt).not.toHaveProperty("billing.card")

    const result = await Effect.runPromise(
      redactSpans({ spans, organizationId: ORG, policyByProjectId: ENFORCE, pseudonymSecret: undefined }),
    )

    expect(result.spans[0]?.attrString["billing.card"]).toBe("[REDACTED_CREDIT_CARD]")
    expect(JSON.stringify(result.spans[0])).not.toContain(LONG_CARD)
  })

  it("redacts content carried only in span events, which no parser reads", async () => {
    const request = buildRequest(
      [str("gen_ai.system", "openai")],
      [
        {
          name: "gen_ai.user.message",
          timeUnixNano: "1710590400100000000",
          attributes: [str("content", `hi ${EMAIL}`)],
        },
      ],
    )
    const { before, after } = await transformAndRedact(request)

    expect(before).toContain(EMAIL)
    expect(after).not.toContain(EMAIL)
  })

  it("redacts operational resource attributes without dropping their keys", async () => {
    const request: OtlpExportTraceServiceRequest = {
      resourceSpans: [
        {
          resource: { attributes: [str("service.name", "my-app"), str("host.owner", EMAIL)] },
          scopeSpans: [
            {
              scope: { name: "test", version: "1" },
              spans: [
                {
                  traceId: "0af7651916cd43dd8448eb211c80319c",
                  spanId: "a1b2c3d4e5f60001",
                  name: "chat",
                  kind: 3,
                  startTimeUnixNano: "1710590400000000000",
                  endTimeUnixNano: "1710590401000000000",
                  attributes: [str("gen_ai.system", "openai")],
                },
              ],
            },
          ],
        },
      ],
    }
    const { spans } = transformOtlpToSpans(request, CONTEXT)
    const result = await Effect.runPromise(
      redactSpans({ spans, organizationId: ORG, policyByProjectId: ENFORCE, pseudonymSecret: undefined }),
    )

    expect(result.spans[0]?.resourceString["host.owner"]).toBe("[REDACTED_EMAIL]")
    expect(result.spans[0]?.resourceString["service.name"]).toBe("my-app")
  })

  it("keeps operational attributes and metrics intact", async () => {
    const { spans } = transformOtlpToSpans(
      buildRequest([
        str("gen_ai.system", "openai"),
        str("gen_ai.request.model", "gpt-4"),
        str("gen_ai.input.messages", JSON.stringify([{ role: "user", parts: [{ type: "text", content: EMAIL }] }])),
      ]),
      CONTEXT,
    )
    const result = await Effect.runPromise(
      redactSpans({ spans, organizationId: ORG, policyByProjectId: ENFORCE, pseudonymSecret: undefined }),
    )
    const redacted = result.spans[0]

    expect(redacted?.attrString["gen_ai.request.model"]).toBe("gpt-4")
    expect(redacted?.model).toBe(spans[0]?.model)
    expect(redacted?.provider).toBe(spans[0]?.provider)
    expect(redacted?.traceId).toBe(spans[0]?.traceId)
    expect(redacted?.spanId).toBe(spans[0]?.spanId)
    expect(redacted?.startTime).toEqual(spans[0]?.startTime)
  })

  it("leaves a span untouched when its project has no policy", async () => {
    const { spans } = transformOtlpToSpans(
      buildRequest([
        str("gen_ai.system", "openai"),
        str("gen_ai.input.messages", JSON.stringify([{ role: "user", parts: [{ type: "text", content: EMAIL }] }])),
      ]),
      CONTEXT,
    )
    const result = await Effect.runPromise(
      redactSpans({ spans, organizationId: ORG, policyByProjectId: new Map(), pseudonymSecret: undefined }),
    )

    expect(JSON.stringify(result.spans[0])).toBe(JSON.stringify(spans[0]))
  })
})

const ACCOUNT = "ACME-1234"

const enforceWith = (rules: RedactionRule[]): ReadonlyMap<string, ResolvedRedactionPolicy> =>
  new Map([
    [PROJECT, resolveRedactionPolicy({ organization: null, project: { redaction: { mode: "enforce", rules } } })],
  ])

const redactWithRules = async (attributes: OtlpKeyValue[], rules: RedactionRule[], events?: OtlpSpan["events"]) => {
  const { spans } = transformOtlpToSpans(buildRequest(attributes, events), CONTEXT)
  const result = await Effect.runPromise(
    redactSpans({ spans, organizationId: ORG, policyByProjectId: enforceWith(rules), pseudonymSecret: undefined }),
  )

  return { before: spans[0], after: result.spans[0], summary: result.summary }
}

const TERMS_RULE: RedactionRule = { id: "r1", label: "ACCOUNT_NUMBER", kind: "terms", terms: [ACCOUNT] }

describe("custom rules over the real transform", () => {
  /**
   * `transformSpan` copies every string attribute verbatim into `attr_string` beside the parsed
   * columns, so a rule that only reached the parsed columns would leave a full plaintext copy in
   * the same row. This is the highest-risk property in the whole feature.
   */
  it("redacts a custom term in the parsed columns and in attr_string alike", async () => {
    const { after } = await redactWithRules(
      [
        str("gen_ai.system", "openai"),
        str(
          "gen_ai.input.messages",
          JSON.stringify([{ role: "user", parts: [{ type: "text", content: `account ${ACCOUNT}` }] }]),
        ),
      ],
      [TERMS_RULE],
    )

    expect(JSON.stringify(after?.inputMessages)).toContain("[REDACTED_ACCOUNT_NUMBER]")
    expect(JSON.stringify(after)).not.toContain(ACCOUNT)
  })

  it("redacts a custom term in tool output", async () => {
    const { after } = await redactWithRules(
      [
        str("gen_ai.operation.name", "execute_tool"),
        str("gen_ai.tool.name", "lookup"),
        str("gen_ai.tool.call.result", JSON.stringify({ account: ACCOUNT })),
      ],
      [TERMS_RULE],
    )

    expect(after?.toolOutput).toContain("[REDACTED_ACCOUNT_NUMBER]")
    expect(after?.toolOutput).not.toContain(ACCOUNT)
  })

  // Instrumentations on the older gen_ai convention put content only in span events, where no
  // content parser reads it: `events_json` is the sole copy.
  it("redacts a custom term in events_json", async () => {
    const { after } = await redactWithRules(
      [str("gen_ai.system", "openai")],
      [TERMS_RULE],
      [{ name: "gen_ai.user.message", attributes: [str("content", `account ${ACCOUNT}`)] }],
    )

    expect(after?.eventsJson).toContain("[REDACTED_ACCOUNT_NUMBER]")
    expect(after?.eventsJson).not.toContain(ACCOUNT)
  })

  it("redacts a custom pattern", async () => {
    const rule: RedactionRule = { id: "r1", label: "ACCOUNT_NUMBER", kind: "pattern", pattern: "ACCT-\\d{9}" }
    const { after } = await redactWithRules([str("acme.note", "ref ACCT-123456789")], [rule])

    expect(after?.attrString["acme.note"]).toBe("ref [REDACTED_ACCOUNT_NUMBER]")
  })

  it("counts custom matches under the rule's own label", async () => {
    const { summary } = await redactWithRules([str("acme.note", `a ${ACCOUNT} b ${ACCOUNT}`)], [TERMS_RULE])

    expect(summary.counts.ACCOUNT_NUMBER).toBe(2)
  })

  it("applies no custom rule to a project absent from the policy map", async () => {
    const { spans } = transformOtlpToSpans(buildRequest([str("acme.note", ACCOUNT)]), CONTEXT)
    const result = await Effect.runPromise(
      redactSpans({ spans, organizationId: ORG, policyByProjectId: new Map(), pseudonymSecret: undefined }),
    )

    expect(JSON.stringify(result.spans[0])).toBe(JSON.stringify(spans[0]))
  })
})

describe("attribute_key rules over the real transform", () => {
  const KEY_RULE: RedactionRule = {
    id: "r1",
    label: "STAFF_ID",
    kind: "attribute_key",
    keys: ["acme.staff.id", "acme.customer.*"],
  }

  /**
   * Masks rather than deletes, so a redacting project's attribute panel still shows every key the
   * exporter sent. A missing key would be indistinguishable from one that was never sent.
   */
  it("masks a named key in attr_string while leaving its siblings", async () => {
    const { after } = await redactWithRules(
      [str("acme.staff.id", "staff-77"), str("acme.customer.tax_id", "T-1"), str("gen_ai.request.model", "gpt-4")],
      [KEY_RULE],
    )

    expect(after?.attrString["acme.staff.id"]).toBe("[REDACTED_STAFF_ID]")
    expect(after?.attrString["acme.customer.tax_id"]).toBe("[REDACTED_STAFF_ID]")
    expect(after?.attrString["gen_ai.request.model"]).toBe("gpt-4")
  })

  /**
   * Wider than the built-in content-key drop, which only touches `attr_string`. A key named
   * explicitly is meant wherever it appears, and dropping one cannot produce a false positive.
   */
  it("masks a named key in resource_string too", async () => {
    const request: OtlpExportTraceServiceRequest = {
      resourceSpans: [
        {
          resource: { attributes: [str("service.name", "my-app"), str("acme.staff.id", "staff-77")] },
          scopeSpans: [
            {
              scope: { name: "test.instrumentation", version: "1.0.0" },
              spans: [
                {
                  traceId: "0af7651916cd43dd8448eb211c80319c",
                  spanId: "a1b2c3d4e5f60002",
                  name: "chat",
                  kind: 3,
                  startTimeUnixNano: "1710590400000000000",
                  endTimeUnixNano: "1710590401000000000",
                  attributes: [str("gen_ai.system", "openai")],
                },
              ],
            },
          ],
        },
      ],
    }
    const { spans } = transformOtlpToSpans(request, CONTEXT)
    const result = await Effect.runPromise(
      redactSpans({
        spans,
        organizationId: ORG,
        policyByProjectId: enforceWith([KEY_RULE]),
        pseudonymSecret: undefined,
      }),
    )

    expect(spans[0]?.resourceString["acme.staff.id"]).toBe("staff-77")
    expect(result.spans[0]?.resourceString["acme.staff.id"]).toBe("[REDACTED_STAFF_ID]")
    expect(result.spans[0]?.resourceString["service.name"]).toBe("my-app")
  })

  // Unlike value scanning, an explicit key rule is not gated on the metadata scope.
  it("masks a named key in metadata even with the metadata scope off", async () => {
    const { before, after } = await redactWithRules(
      [str("gen_ai.system", "openai"), str("traceloop.association.properties.acme.staff.id", "staff-77")],
      [{ id: "r1", label: "STAFF_ID", kind: "attribute_key", keys: ["acme.staff.id"] }],
    )

    // Without this the assertion below would pass on a map that never held the key.
    expect(before?.metadata["acme.staff.id"]).toBe("staff-77")
    expect(after?.metadata["acme.staff.id"]).toBe("[REDACTED_STAFF_ID]")
  })

  /**
   * A customer naming `acme.customer.tax_id` does not know which OTLP type it arrived as, and the
   * value passes cannot reach these maps: a boolean matches no detector at all. Key rules only
   * touched the string maps, so the value survived under the very key the rule named.
   */
  it("masks a named key whatever OTLP type it arrived as", async () => {
    const attributes = [
      { key: "acme.staff.id", value: { intValue: "77" } },
      { key: "acme.staff.score", value: { doubleValue: 4.5 } },
      { key: "acme.staff.active", value: { boolValue: true } },
    ]
    const { before, after } = await redactWithRules(attributes, [
      { id: "r1", label: "STAFF_ID", kind: "attribute_key", keys: ["acme.staff.*"] },
    ])

    // Without these the assertions below would pass on maps that never held the keys.
    expect(before?.attrInt).toHaveProperty("acme.staff.id")
    expect(before?.attrFloat).toHaveProperty("acme.staff.score")
    expect(before?.attrBool).toHaveProperty("acme.staff.active")

    expect(after?.attrInt).not.toHaveProperty("acme.staff.id")
    expect(after?.attrFloat).not.toHaveProperty("acme.staff.score")
    expect(after?.attrBool).not.toHaveProperty("acme.staff.active")
    expect(after?.attrString["acme.staff.id"]).toBe("[REDACTED_STAFF_ID]")
    expect(after?.attrString["acme.staff.score"]).toBe("[REDACTED_STAFF_ID]")
    expect(after?.attrString["acme.staff.active"]).toBe("[REDACTED_STAFF_ID]")
  })

  // A masked key is a match like any other, so it needs no stat of its own.
  it("counts each masked key under the rule's label", async () => {
    const { summary } = await redactWithRules(
      [str("acme.staff.id", "staff-77"), str("acme.customer.tax_id", "T-1")],
      [KEY_RULE],
    )

    expect(summary.counts.STAFF_ID).toBe(2)
  })
})
