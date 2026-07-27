import { OrganizationId, type ResolvedRedactionPolicy, resolveRedactionPolicy } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { TransformContext } from "../otlp/transform.ts"
import { transformOtlpToSpans } from "../otlp/transform.ts"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue, OtlpSpan } from "../otlp/types.ts"
import { redactSpans } from "./redact-spans.ts"

/**
 * End-to-end over the real transform rather than a hand-built span.
 *
 * A fixture can be made to pass while the pipeline still leaks, because
 * `transformSpan` copies every raw content attribute into `attr_string` next to
 * the parsed columns. These tests assert against the transform's actual output for
 * each vendor shape, so a parser whose keys are not declared shows up here.
 */

const ORG = OrganizationId("org_test")
const PROJECT = "proj_test"

const EMAIL = "victim@example.com"
const PHONE = "+14155552671"
const CARD = "4111111111111111"
const SECRET = "sk-proj-abc123DEF456ghi789JKL012mno345PQR678stu"

const str = (key: string, value: string): OtlpKeyValue => ({ key, value: { stringValue: value } })

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
    expect(before).toMatch(new RegExp(`${EMAIL}|\\${PHONE}|${CARD}|${SECRET}`))

    expect(after).not.toContain(EMAIL)
    expect(after).not.toContain(PHONE)
    expect(after).not.toContain(CARD)
    expect(after).not.toContain(SECRET)
  })

  it("proves the raw attribute copy is the thing being removed, not just the parsed column", async () => {
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

    const { after, summary } = await transformAndRedact(buildRequest(attributes))

    expect(after).not.toContain(EMAIL)
    expect(summary.droppedAttributeKeys).toBeGreaterThan(0)
  })

  /**
   * The value pass cannot do this. Dropping the key removes the whole duplicate
   * copy, including conversation text that no pattern detector matches, which is
   * most of what a conversation actually contains.
   */
  it("removes duplicated conversation text that no detector would have matched", async () => {
    const prose = "Margaret Hale lives on Crampton Terrace and prefers afternoon appointments"
    const attributes = [
      str("gen_ai.system", "openai"),
      str("gen_ai.input.messages", JSON.stringify([{ role: "user", parts: [{ type: "text", content: prose }] }])),
    ]
    const { spans } = transformOtlpToSpans(buildRequest(attributes), CONTEXT)

    expect(spans[0]?.attrString["gen_ai.input.messages"]).toContain(prose)

    const result = await Effect.runPromise(
      redactSpans({ spans, organizationId: ORG, policyByProjectId: ENFORCE, pseudonymSecret: undefined }),
    )

    expect(JSON.stringify(result.spans[0]?.attrString)).not.toContain(prose)
    // The parsed column still carries it: pattern detectors do not catch names or
    // addresses, and claiming otherwise is exactly what the docs must not do.
    expect(JSON.stringify(result.spans[0]?.inputMessages)).toContain(prose)
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
