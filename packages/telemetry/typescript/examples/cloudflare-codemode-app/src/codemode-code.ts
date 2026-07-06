import type { ModelMessage } from "ai"

export function extractCodemodeCode(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fenced = trimmed.match(/```(?:javascript|js)?\s*\n?([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const code = fenced[1].trim()
    if (looksLikeCodemodeFn(code)) return code
  }

  if (looksLikeCodemodeFn(trimmed)) return trimmed

  if (trimmed.includes("codemode.")) {
    return trimmed.startsWith("async") ? trimmed : `async () => {\n${trimmed}\n}`
  }

  return null
}

function looksLikeCodemodeFn(code: string) {
  return /async\s*\(\s*\)\s*=>/.test(code) || /await\s+codemode\./.test(code)
}

function textFromModelMessage(message: ModelMessage) {
  if (typeof message.content === "string") return message.content
  if (!Array.isArray(message.content)) return ""
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
}

export function latestUserText(
  uiMessages: Array<{ role: string; parts?: Array<{ type?: string; text?: string }> }>,
  modelMessages: ModelMessage[],
) {
  for (let index = uiMessages.length - 1; index >= 0; index -= 1) {
    const message = uiMessages[index]
    if (message.role !== "user") continue
    const text = (message.parts ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
    if (text) return text
  }

  for (let index = modelMessages.length - 1; index >= 0; index -= 1) {
    const message = modelMessages[index]
    if (message.role !== "user") continue
    const text = textFromModelMessage(message)
    if (text) return text
  }

  return ""
}

export function shouldRunCodemodeOrchestration(text: string) {
  return /\b(weather|trip|travel|weekend|compare|recommend|cities?|barcelona|paris|london|berlin|rome)\b/i.test(
    text,
  )
}
