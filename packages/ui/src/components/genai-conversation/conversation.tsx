import { useMemo } from "react"
import type { GenAIMessage, GenAIPart, GenAISystem } from "rosetta-ai"
import { Text } from "../text/text.tsx"
import { Message } from "./message.tsx"
import { Part, type ToolCallResult } from "./part.tsx"
import { getKnownField } from "./parts/helpers.tsx"

function SystemInstructionsBlock({ parts }: { readonly parts: readonly GenAIPart[] }) {
  return (
    <div className="border-l-2 border-primary bg-muted/50 rounded-r-lg px-4 py-3">
      <div className="flex flex-col gap-2">
        {parts.map((part, i) => (
          <Part key={i} part={part} />
        ))}
      </div>
    </div>
  )
}

interface ToolResponsePart {
  readonly type: "tool_call_response"
  readonly id?: string | null
  readonly response?: unknown
  readonly result?: unknown
  readonly _provider_metadata?: Record<string, unknown>
}

function buildToolResultsMap(messages: readonly (GenAIMessage | null)[]): {
  resultMap: ReadonlyMap<string, ToolCallResult>
  absorbedIndexes: ReadonlySet<number>
} {
  const resultMap = new Map<string, ToolCallResult>()
  const absorbedIndexes = new Set<number>()

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || msg.role !== "tool") continue

    const parts = msg.parts ?? []
    let allAbsorbed = true

    for (const part of parts) {
      if (part.type !== "tool_call_response") {
        allAbsorbed = false
        continue
      }
      const p = part as ToolResponsePart
      const id = p.id
      if (!id) {
        allAbsorbed = false
        continue
      }
      const response = p.response ?? p.result
      const isError = getKnownField<boolean>(p._provider_metadata, "isError") === true
      resultMap.set(id, { response, isError })
    }

    if (allAbsorbed && parts.length > 0) {
      absorbedIndexes.add(i)
    }
  }

  return { resultMap, absorbedIndexes }
}

function normalizeMessage(message: GenAIMessage): GenAIMessage {
  if (message.parts && message.parts.length > 0) return message
  const content = (message as { content?: string }).content
  if (typeof content === "string") {
    return { ...message, parts: [{ type: "text" as const, content }] }
  }
  return message
}

export function Conversation({
  systemInstructions,
  messages,
}: {
  readonly systemInstructions?: GenAISystem
  readonly messages: readonly (GenAIMessage | null)[]
}) {
  const hasSystem = systemInstructions && systemInstructions.length > 0

  const { resultMap, absorbedIndexes } = useMemo(() => buildToolResultsMap(messages), [messages])

  const visibleMessages = useMemo(
    () =>
      messages.reduce<{ message: GenAIMessage; index: number }[]>((acc, msg, i) => {
        if (!msg) return acc
        if (absorbedIndexes.has(i)) return acc
        acc.push({ message: normalizeMessage(msg), index: i })
        return acc
      }, []),
    [messages, absorbedIndexes],
  )

  if (!hasSystem && visibleMessages.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 flex-1">
        <Text.H5 color="foregroundMuted">No conversation data</Text.H5>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {hasSystem && <SystemInstructionsBlock parts={systemInstructions} />}
      {visibleMessages.map(({ message, index }) => (
        <Message
          key={index}
          message={message}
          alignment={message.role === "user" ? "right" : "left"}
          toolResults={message.role === "assistant" ? resultMap : undefined}
        />
      ))}
    </div>
  )
}
