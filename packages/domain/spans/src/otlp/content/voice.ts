/**
 * Content parser for STT/TTS spans that carry flat text and optional audio attrs
 * instead of gen_ai.{input,output}.messages arrays.
 */
import type { GenAIMessage } from "rosetta-ai"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import type { ParsedContent } from "./index.ts"

const EMPTY: ParsedContent = { inputMessages: [], outputMessages: [], systemInstructions: [], toolDefinitions: [] }

function audioMimeType(explicit: string | undefined, format: string | undefined): string | undefined {
  if (explicit) return explicit
  if (!format) return undefined
  const lower = format.toLowerCase()
  if (lower.includes("mpeg") || lower === "mp3") return "audio/mpeg"
  if (lower.includes("wav") || lower === "pcm16" || lower === "pcm") return "audio/wav"
  if (lower.includes("ogg")) return "audio/ogg"
  if (lower.includes("webm")) return "audio/webm"
  if (lower.startsWith("audio/")) return lower
  return "application/octet-stream"
}

function audioPartFromAttrs(
  attrs: readonly OtlpKeyValue[],
  uriKeys: readonly string[],
  blobKeys: readonly string[],
  mimeKeys: readonly string[],
  formatKeys: readonly string[],
): Record<string, unknown> | undefined {
  for (const key of uriKeys) {
    const uri = stringAttr(attrs, key)
    if (uri) {
      const mimeType = audioMimeType(
        mimeKeys.map((k) => stringAttr(attrs, k)).find(Boolean),
        formatKeys.map((k) => stringAttr(attrs, k)).find(Boolean),
      )
      return { type: "uri", modality: "audio", uri, ...(mimeType ? { mime_type: mimeType } : {}) }
    }
  }

  for (const key of blobKeys) {
    const content = stringAttr(attrs, key)
    if (content) {
      const mimeType = audioMimeType(
        mimeKeys.map((k) => stringAttr(attrs, k)).find(Boolean),
        formatKeys.map((k) => stringAttr(attrs, k)).find(Boolean),
      )
      return {
        type: "blob",
        modality: "audio",
        content,
        ...(mimeType ? { mime_type: mimeType } : {}),
      }
    }
  }

  return undefined
}

function textPart(content: string | undefined): Record<string, unknown> | undefined {
  if (!content) return undefined
  return { type: "text", content }
}

function message(role: string, parts: Record<string, unknown>[]): GenAIMessage | undefined {
  if (parts.length === 0) return undefined
  return { role, parts } as GenAIMessage
}

export function parseVoice(attrs: readonly OtlpKeyValue[]): ParsedContent {
  const operation = stringAttr(attrs, "gen_ai.operation.name")

  const inputText =
    stringAttr(attrs, "gen_ai.input.text") ?? (operation === "speech" ? stringAttr(attrs, "lk.input_text") : undefined)
  const outputText =
    stringAttr(attrs, "gen_ai.output.text") ??
    (operation === "transcribe" ? stringAttr(attrs, "lk.user_transcript") : undefined)

  const inputAudio = audioPartFromAttrs(
    attrs,
    ["gen_ai.input.audio.uri", "voice.input.uri", "latitude.audio.input.uri"],
    ["gen_ai.input.audio", "voice.input.audio", "latitude.audio.input"],
    ["gen_ai.input.audio.mime_type", "voice.input.mime_type"],
    ["openai.agents.audio.input_format", "gen_ai.input.audio.format"],
  )
  const outputAudio = audioPartFromAttrs(
    attrs,
    ["gen_ai.output.audio.uri", "voice.output.uri", "latitude.audio.output.uri"],
    ["gen_ai.output.audio", "voice.output.audio", "latitude.audio.output"],
    ["gen_ai.output.audio.mime_type", "voice.output.mime_type"],
    ["openai.agents.audio.output_format", "gen_ai.output.audio.format"],
  )

  const inputParts = [inputAudio, textPart(inputText)].filter(Boolean) as Record<string, unknown>[]
  const outputParts = [textPart(outputText), outputAudio].filter(Boolean) as Record<string, unknown>[]

  const inputMessages = [message("user", inputParts)].filter(Boolean) as GenAIMessage[]
  const outputMessages = [message("assistant", outputParts)].filter(Boolean) as GenAIMessage[]

  if (inputMessages.length === 0 && outputMessages.length === 0) return EMPTY
  return { inputMessages, outputMessages, systemInstructions: [], toolDefinitions: [] }
}
