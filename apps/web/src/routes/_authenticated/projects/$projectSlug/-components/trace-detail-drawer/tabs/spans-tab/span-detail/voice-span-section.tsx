import type { GenAIMessage, GenAIPart } from "rosetta-ai"
import { DetailSection, Part, Text } from "@repo/ui"
import { ArrowDownRightIcon, ArrowUpRightIcon, MicIcon, Volume2Icon } from "lucide-react"
import type { ReactNode } from "react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"

const VOICE_OPERATIONS = new Set(["transcribe", "speech"])

function isAudioPart(part: GenAIPart): boolean {
  if (part.type !== "uri" && part.type !== "blob") return false
  return (part as { modality?: string }).modality === "audio"
}

function textParts(parts: readonly GenAIPart[]): GenAIPart[] {
  return parts.filter((p) => p.type === "text")
}

function audioParts(parts: readonly GenAIPart[]): GenAIPart[] {
  return parts.filter(isAudioPart)
}

export function isVoiceSpan(span: SpanDetailRecord): boolean {
  if (VOICE_OPERATIONS.has(span.operation)) return true
  const messages = [...span.inputMessages, ...span.outputMessages] as GenAIMessage[]
  return messages.some((m) => Array.isArray(m.parts) && m.parts.some(isAudioPart))
}

function VoiceMessageBlock({
  label,
  icon,
  messages,
}: {
  readonly label: string
  readonly icon: ReactNode
  readonly messages: readonly GenAIMessage[]
}) {
  if (messages.length === 0) return null

  const parts = messages.flatMap((m) => (Array.isArray(m.parts) ? m.parts : []))
  const audio = audioParts(parts)
  const text = textParts(parts)

  if (audio.length === 0 && text.length === 0) return null

  return (
    <DetailSection icon={icon} label={label}>
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-secondary p-4">
        {audio.map((part, index) => (
          <Part key={`audio-${index}`} part={part} />
        ))}
        {text.map((part, index) => (
          <Part key={`text-${index}`} part={part} />
        ))}
      </div>
    </DetailSection>
  )
}

export function VoiceSpanSection({ span }: { readonly span: SpanDetailRecord }) {
  const input = span.inputMessages as unknown as GenAIMessage[]
  const output = span.outputMessages as unknown as GenAIMessage[]
  const hasInput = input.length > 0
  const hasOutput = output.length > 0

  if (!hasInput && !hasOutput) {
    return (
      <DetailSection icon={<MicIcon className="h-4 w-4" />} label="Voice">
        <Text.H6 color="foregroundMuted">No voice payload on this span</Text.H6>
      </DetailSection>
    )
  }

  return (
    <>
      <VoiceMessageBlock label="Input" icon={<ArrowDownRightIcon className="h-4 w-4" />} messages={input} />
      <VoiceMessageBlock label="Output" icon={<ArrowUpRightIcon className="h-4 w-4" />} messages={output} />
      {VOICE_OPERATIONS.has(span.operation) ? (
        <DetailSection icon={<Volume2Icon className="h-4 w-4" />} label="Operation">
          <Text.H5>{span.operation === "transcribe" ? "Speech to text" : "Text to speech"}</Text.H5>
        </DetailSection>
      ) : null}
    </>
  )
}
