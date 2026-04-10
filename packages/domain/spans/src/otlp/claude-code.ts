import { intAttr, stringAttr } from "./attributes.ts"
import type { OtlpKeyValue } from "./types.ts"

const SPAN_TYPE = "span.type"

const ANSI_SGR_RE = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g")

/** Strip ANSI SGR sequences and common terminal suffix noise from model strings. */
function sanitizeModelName(raw: string): string {
  return raw
    .replace(ANSI_SGR_RE, "")
    .replace(/\[[0-9;]*m$/i, "")
    .trim()
}

function hasKey(attrs: readonly OtlpKeyValue[], key: string): boolean {
  return attrs.some((a) => a.key === key)
}

/**
 * Claude Code emits custom trace attributes (`span.type`, `user_prompt`, `model`, `input_tokens`, …).
 * Duplicate GenAI-shaped keys so existing resolvers and {@link parseContent} can consume them.
 */
export function expandClaudeCodeSpanAttributes(attrs: readonly OtlpKeyValue[]): OtlpKeyValue[] {
  const spanType = stringAttr(attrs, SPAN_TYPE)
  if (spanType !== "interaction" && spanType !== "llm_request") return []

  const extra: OtlpKeyValue[] = []

  if (spanType === "interaction") {
    const prompt = stringAttr(attrs, "user_prompt")
    if (prompt !== undefined && !hasKey(attrs, "gen_ai.input.messages")) {
      const messages = JSON.stringify([{ role: "user", parts: [{ type: "text", content: prompt }] }])
      extra.push({ key: "gen_ai.input.messages", value: { stringValue: messages } })
    }
    if (!hasKey(attrs, "gen_ai.operation.name")) {
      extra.push({ key: "gen_ai.operation.name", value: { stringValue: "prompt" } })
    }
  }

  if (spanType === "llm_request") {
    if (!hasKey(attrs, "gen_ai.provider.name")) {
      extra.push({ key: "gen_ai.provider.name", value: { stringValue: "anthropic" } })
    }
    if (!hasKey(attrs, "gen_ai.operation.name")) {
      extra.push({ key: "gen_ai.operation.name", value: { stringValue: "chat" } })
    }

    const modelRaw = stringAttr(attrs, "model")
    if (modelRaw !== undefined && !hasKey(attrs, "gen_ai.request.model")) {
      extra.push({ key: "gen_ai.request.model", value: { stringValue: sanitizeModelName(modelRaw) } })
    }

    const inputTok = intAttr(attrs, "input_tokens")
    if (inputTok !== undefined && !hasKey(attrs, "gen_ai.usage.input_tokens")) {
      extra.push({ key: "gen_ai.usage.input_tokens", value: { intValue: String(inputTok) } })
    }

    const outputTok = intAttr(attrs, "output_tokens")
    if (outputTok !== undefined && !hasKey(attrs, "gen_ai.usage.output_tokens")) {
      extra.push({ key: "gen_ai.usage.output_tokens", value: { intValue: String(outputTok) } })
    }

    const cacheRead = intAttr(attrs, "cache_read_tokens")
    if (cacheRead !== undefined && !hasKey(attrs, "gen_ai.usage.cache_read.input_tokens")) {
      extra.push({ key: "gen_ai.usage.cache_read.input_tokens", value: { intValue: String(cacheRead) } })
    }

    const cacheCreate = intAttr(attrs, "cache_creation_tokens")
    if (cacheCreate !== undefined && !hasKey(attrs, "gen_ai.usage.cache_creation.input_tokens")) {
      extra.push({ key: "gen_ai.usage.cache_creation.input_tokens", value: { intValue: String(cacheCreate) } })
    }

    // Claude Code reports non-cached input_tokens + cache_* (additive). A bare
    // gen_ai.usage.input_tokens is treated as inclusive; total_tokens enables
    // resolveTokens strategy 1 to infer additive input when cache is present.
    if (inputTok !== undefined && outputTok !== undefined && !hasKey(attrs, "gen_ai.usage.total_tokens")) {
      const cr = cacheRead ?? 0
      const cc = cacheCreate ?? 0
      extra.push({
        key: "gen_ai.usage.total_tokens",
        value: { intValue: String(inputTok + outputTok + cr + cc) },
      })
    }

    const ttftMs = intAttr(attrs, "ttft_ms")
    if (ttftMs !== undefined && ttftMs > 0 && !hasKey(attrs, "gen_ai.server.time_to_first_token")) {
      const ns = ttftMs * 1_000_000
      extra.push({ key: "gen_ai.server.time_to_first_token", value: { intValue: String(ns) } })
    }
  }

  if (extra.length === 0) return []
  return [...extra, ...attrs]
}
