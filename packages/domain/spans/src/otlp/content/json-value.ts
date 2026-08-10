/**
 * Fallback content parser for the OpenInference `input.value` / `output.value`
 * JSON payloads — used by CrewAI and other agent/chain spans that emit no
 * per-message attributes (CrewAI stashes the whole exchange under `output.value`).
 * Runs after the more specific parsers (gen_ai, OpenInference `llm.*_messages`, Vercel).
 *
 * Extraction and translation are shared with the trace-import path, which reads the same
 * opaque payloads out of a vendor API instead of an attribute. What stays here is this
 * parser's own policy: a payload holding no messages contributes no content, because the
 * raw attribute is still on the span for anyone who needs it.
 */
import { extractMessages, translateCombinedMessages, translateMessages } from "../../helpers/message-payload.ts"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import type { ParsedContent } from "./index.ts"

const EMPTY: ParsedContent = { inputMessages: [], outputMessages: [], systemInstructions: [], toolDefinitions: [] }

export function parseJsonValue(attrs: readonly OtlpKeyValue[]): ParsedContent {
  const inVal = extractMessages(stringAttr(attrs, "input.value"))
  const outVal = extractMessages(stringAttr(attrs, "output.value"))

  if (inVal && outVal) {
    const input = translateMessages(inVal, "input")
    const output = translateMessages(outVal, "output")
    return {
      inputMessages: input.messages,
      outputMessages: output.messages,
      systemInstructions: input.system,
      toolDefinitions: [],
    }
  }

  // Single payload holding the full exchange (CrewAI): trailing assistant turn is output.
  const combined = outVal ?? inVal
  if (!combined) return EMPTY

  return { ...translateCombinedMessages(combined), toolDefinitions: [] }
}
