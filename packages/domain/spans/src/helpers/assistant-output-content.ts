import type { GenAIMessage } from "rosetta-ai"

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

export const assistantMessageHasOutputContent = (message: GenAIMessage): boolean => {
  if (message.role !== "assistant" || !Array.isArray(message.parts)) return false

  return message.parts.some(
    (part) =>
      isRecord(part) &&
      (part.type === "tool_call" ||
        (part.type === "text" && typeof part.content === "string" && part.content.trim() !== "")),
  )
}

export const hasUsableAssistantCompletion = (outputMessages: readonly GenAIMessage[]): boolean => {
  for (let index = outputMessages.length - 1; index >= 0; index--) {
    const message = outputMessages[index]!
    if (message.role === "assistant") return assistantMessageHasOutputContent(message)
  }
  return false
}
