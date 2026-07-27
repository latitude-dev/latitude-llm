import { describe, expect, it } from "vitest"
import { CLAUDE_CODE_CONTENT_ATTRIBUTE_KEYS } from "./claude-code.ts"
import { FLUE_CONTENT_ATTRIBUTE_KEYS } from "./flue.ts"
import { GENAI_CONTENT_ATTRIBUTE_KEYS } from "./genai.ts"
import { GENAI_DEPRECATED_CONTENT_ATTRIBUTE_KEYS } from "./genai_deprecated.ts"
import { isContentAttributeKey } from "./index.ts"
import { JSON_VALUE_CONTENT_ATTRIBUTE_KEYS } from "./json-value.ts"
import { LIVEKIT_CONTENT_ATTRIBUTE_KEYS } from "./livekit.ts"
import { OPENINFERENCE_CONTENT_ATTRIBUTE_KEYS } from "./openinference.ts"
import { VERCEL_CONTENT_ATTRIBUTE_KEYS } from "./vercel.ts"

const VENDORS = {
  genai: GENAI_CONTENT_ATTRIBUTE_KEYS,
  genai_deprecated: GENAI_DEPRECATED_CONTENT_ATTRIBUTE_KEYS,
  openinference: OPENINFERENCE_CONTENT_ATTRIBUTE_KEYS,
  vercel: VERCEL_CONTENT_ATTRIBUTE_KEYS,
  livekit: LIVEKIT_CONTENT_ATTRIBUTE_KEYS,
  flue: FLUE_CONTENT_ATTRIBUTE_KEYS,
  "claude-code": CLAUDE_CODE_CONTENT_ATTRIBUTE_KEYS,
  "json-value": JSON_VALUE_CONTENT_ATTRIBUTE_KEYS,
} as const

describe("isContentAttributeKey", () => {
  // Vectors come from the parsers' own declarations, so a parser that gains a key
  // without declaring it is the only way this can drift.
  it.each(Object.entries(VENDORS))("covers every exact key declared by %s", (_vendor, keys) => {
    for (const key of keys.exact) {
      expect(isContentAttributeKey(key)).toBe(true)
    }
  })

  it.each(Object.entries(VENDORS))("covers keys under every prefix declared by %s", (_vendor, keys) => {
    for (const prefix of keys.prefixes) {
      expect(isContentAttributeKey(`${prefix}0.content`)).toBe(true)
    }
  })

  it("declares at least one key for all eight vendor families", () => {
    expect(Object.keys(VENDORS)).toHaveLength(8)

    for (const [vendor, keys] of Object.entries(VENDORS)) {
      expect(keys.exact.length + keys.prefixes.length, `${vendor} declares no content keys`).toBeGreaterThan(0)
    }
  })

  it.each([
    "gen_ai.input.messages",
    "gen_ai.output.messages",
    "gen_ai.system_instructions",
    "gen_ai.prompt",
    "gen_ai.prompt.0.content",
    "gen_ai.completion.0.tool_calls.0.arguments",
    "llm.input_messages.0.message.content",
    "llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments",
    "ai.prompt",
    "ai.prompt.messages",
    "ai.response.text",
    "lk.chat_ctx",
    "flue.turn.input",
    "user_prompt",
    "input.value",
    "output.value",
  ])("treats %s as content", (key) => {
    expect(isContentAttributeKey(key)).toBe(true)
  })

  it.each([
    "gen_ai.request.model",
    "gen_ai.response.model",
    "gen_ai.operation.name",
    "gen_ai.usage.input_tokens",
    "llm.model_name",
    "llm.token_count.total",
    "ai.model.id",
    "ai.settings.maxRetries",
    "openinference.span.kind",
    "latitude.project",
    "session.id",
    "user.id",
    "service.name",
    "http.method",
  ])("does not treat the operational attribute %s as content", (key) => {
    expect(isContentAttributeKey(key)).toBe(false)
  })

  it("does not match on a substring, only an exact key or a declared prefix", () => {
    expect(isContentAttributeKey("custom.gen_ai.prompt")).toBe(false)
    expect(isContentAttributeKey("prefixed_user_prompt")).toBe(false)
  })

  it("does not treat a bare prefix stem as content when only the prefix was declared", () => {
    expect(isContentAttributeKey("llm.input_messages")).toBe(false)
    expect(isContentAttributeKey("llm.input_messages.")).toBe(true)
  })
})
