/**
 * Content parser for Claude Code spans.
 *
 * Claude Code's `interaction` span carries the user's raw prompt in `user_prompt`.
 * We map it to a single user message so the standard input-message pipeline can consume it.
 *
 * Note: Claude Code reports conversation content (prompts and completions) via OTel logs,
 * not span attributes. `user_prompt` is the only content attribute emitted on the span itself.
 */
import type { GenAIMessage } from "rosetta-ai"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import type { ParsedContent } from "./index.ts"

export function parseClaudeCode(attrs: readonly OtlpKeyValue[]): ParsedContent {
  const prompt = stringAttr(attrs, "user_prompt")
  const inputMessages: GenAIMessage[] =
    prompt !== undefined ? [{ role: "user", parts: [{ type: "text", content: prompt }] }] : []

  return {
    inputMessages,
    outputMessages: [],
    systemInstructions: [],
    toolDefinitions: [],
  }
}
