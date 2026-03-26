import { cn, Text } from "@repo/ui"
import { type RefObject, useRef } from "react"
import type { GenAIMessage, GenAIPart, GenAISystem } from "rosetta-ai"
import { ScrollNavigator } from "../scroll-navigator/scroll-navigator.tsx"
import { Message, type ToolCallActions } from "./message.tsx"
import { Part, type ToolCallResult } from "./part.tsx"
import { getKnownField } from "./parts/helpers.tsx"

function SystemInstructionsBlock({ parts }: { readonly parts: readonly GenAIPart[] }) {
  return (
    <div className="rounded-r-lg border-l-2 border-primary bg-muted/50 px-4 py-3">
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
  enableNavigator = false,
  scrollContainerRef,
  messageActions,
  toolCallActions,
}: {
  readonly systemInstructions?: GenAISystem
  readonly messages: readonly (GenAIMessage | null)[]
  readonly enableNavigator?: boolean
  readonly scrollContainerRef?: RefObject<HTMLDivElement | null>
  /** Map of original message index → action, renders a floating navigate button on attributed assistant messages. */
  readonly messageActions?: ReadonlyMap<number, () => void>
  /** Map of toolCallId → action, renders a navigate button inside each ToolCallBlock. */
  readonly toolCallActions?: ToolCallActions
}) {
  const navItemRefs = useRef<(HTMLDivElement | null)[]>([])

  const hasSystem = !!(systemInstructions && systemInstructions.length > 0)
  const { resultMap, absorbedIndexes } = buildToolResultsMap(messages)

  const visibleMessages = messages.reduce<{ message: GenAIMessage; index: number }[]>((acc, msg, i) => {
    if (!msg) return acc
    if (absorbedIndexes.has(i)) return acc

    acc.push({
      message: normalizeMessage(msg),
      index: i,
    })
    return acc
  }, [])

  const totalNavItems = (hasSystem ? 1 : 0) + visibleMessages.length
  navItemRefs.current.length = totalNavItems

  if (!hasSystem && visibleMessages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-6">
        <Text.H5 color="foregroundMuted">No conversation data</Text.H5>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {hasSystem && (
        <div
          ref={(el) => {
            navItemRefs.current[0] = el
          }}
          className="pl-4"
        >
          <SystemInstructionsBlock parts={systemInstructions} />
        </div>
      )}

      {visibleMessages.map(({ message, index }, i) => {
        const navIdx = i + (hasSystem ? 1 : 0)
        const onNavigate = messageActions?.get(index)
        const isAssistant = message.role === "assistant"

        return (
          <div
            key={index}
            ref={(el) => {
              navItemRefs.current[navIdx] = el
            }}
            className={cn("group relative pl-4", {
              "pl-10 py-2 transition-colors hover:bg-muted/50": isAssistant && messageActions,
            })}
          >
            <Message
              message={message}
              alignment={message.role === "user" ? "right" : "left"}
              toolResults={message.role === "assistant" ? resultMap : undefined}
              {...(onNavigate ? { onNavigate } : {})}
              {...(toolCallActions ? { toolCallActions } : {})}
            />
          </div>
        )
      })}

      {enableNavigator && scrollContainerRef && (
        <ScrollNavigator scrollContainerRef={scrollContainerRef} itemRefs={navItemRefs} />
      )}
    </div>
  )
}
