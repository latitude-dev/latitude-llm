import type { GenAIMessage } from "rosetta-ai"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import type { ParsedContent } from "./index.ts"

export function parseElevenlabs(attrs: readonly OtlpKeyValue[]): ParsedContent {
  const userText = stringAttr(attrs, "elevenlabs.user.text")
  const agentText = stringAttr(attrs, "elevenlabs.agent.text")

  const inputMessages: GenAIMessage[] = userText
    ? ([{ role: "user", parts: [{ type: "text", content: userText }] }] as GenAIMessage[])
    : []
  const outputMessages: GenAIMessage[] = agentText
    ? ([{ role: "assistant", parts: [{ type: "text", content: agentText }] }] as GenAIMessage[])
    : []

  return {
    inputMessages,
    outputMessages,
    systemInstructions: [],
    toolDefinitions: [],
  }
}
