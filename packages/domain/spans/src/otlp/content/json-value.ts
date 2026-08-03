/**
 * Fallback content parser for the OpenInference `input.value` / `output.value`
 * JSON payloads — used by CrewAI and other agent/chain spans that emit no
 * per-message attributes (CrewAI stashes the whole exchange under `output.value`).
 * Pulls the embedded OpenAI-style `messages` array and translates it via rosetta-ai.
 * Runs after the more specific parsers (gen_ai, OpenInference `llm.*_messages`, Vercel).
 */
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { safeTranslate } from "rosetta-ai"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import type { ParsedContent } from "./index.ts"

const EMPTY: ParsedContent = { inputMessages: [], outputMessages: [], systemInstructions: [], toolDefinitions: [] }

/** Pulls an OpenAI-style chat `messages` array out of an `input.value`/`output.value` JSON payload. */
function extractMessages(raw: string | undefined): Record<string, unknown>[] | undefined {
  if (!raw) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { messages?: unknown }).messages)
      ? ((parsed as { messages: unknown[] }).messages as unknown[])
      : undefined
  if (!arr || arr.length === 0) return undefined
  if (!arr.every((m) => m !== null && typeof m === "object" && typeof (m as { role?: unknown }).role === "string")) {
    return undefined
  }
  return arr as Record<string, unknown>[]
}

export function parseJsonValue(attrs: readonly OtlpKeyValue[]): ParsedContent {
  const inVal = extractMessages(stringAttr(attrs, "input.value"))
  const outVal = extractMessages(stringAttr(attrs, "output.value"))

  let inputRaw: Record<string, unknown>[]
  let outputRaw: Record<string, unknown>[]
  if (inVal && outVal) {
    inputRaw = inVal
    outputRaw = outVal
  } else {
    // Single payload holding the full exchange (CrewAI): trailing assistant turn is output.
    const combined = outVal ?? inVal
    if (!combined) return EMPTY
    const splitAt =
      (combined[combined.length - 1] as { role?: string }).role === "assistant" ? combined.length - 1 : combined.length
    inputRaw = combined.slice(0, splitAt)
    outputRaw = combined.slice(splitAt)
  }

  let inputMessages: GenAIMessage[] = []
  let outputMessages: GenAIMessage[] = []
  let systemInstructions: GenAISystem = []

  if (inputRaw.length > 0) {
    const result = safeTranslate(inputRaw, { direction: "input" })
    if (!result.error) {
      inputMessages = result.messages as GenAIMessage[]
      if (result.system) systemInstructions = result.system
    }
  }
  if (outputRaw.length > 0) {
    const result = safeTranslate(outputRaw, { direction: "output" })
    if (!result.error) outputMessages = result.messages as GenAIMessage[]
  }

  return { inputMessages, outputMessages, systemInstructions, toolDefinitions: [] }
}
