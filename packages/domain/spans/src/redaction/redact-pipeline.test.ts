import { OrganizationId, type ResolvedRedactionPolicy, resolveRedactionPolicy } from "@domain/shared"
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
const SECRET = "sk-proj-abc123DEF456ghi789JKL012mno345PQR678stu"

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
