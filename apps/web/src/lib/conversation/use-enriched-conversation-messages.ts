import { SpanId } from "@domain/shared"
import { enrichConversationToolCalls, type SpanMessagesData } from "@domain/spans"
import { useMemo } from "react"
import type { GenAIMessage } from "rosetta-ai"
import { useConversationMessageSpans } from "../../domains/spans/spans.collection.ts"
import type { SpanMessagesRecord } from "../../domains/spans/spans.functions.ts"

const toMessageSpans = (records: readonly SpanMessagesRecord[]): readonly SpanMessagesData[] =>
  records.map((record) => ({
    spanId: SpanId(record.spanId),
    operation: record.operation,
    toolCallId: record.toolCallId,
    toolName: record.toolName,
    toolInput: record.toolInput,
    toolOutput: record.toolOutput,
    inputMessages: record.inputMessages as readonly GenAIMessage[],
    outputMessages: record.outputMessages as readonly GenAIMessage[],
  }))

export function useEnrichedConversationMessages(
  messages: readonly GenAIMessage[],
  {
    projectId,
    traceId,
    startTime,
    enabled = true,
  }: {
    readonly projectId: string
    readonly traceId: string
    readonly startTime: string | undefined
    readonly enabled?: boolean
  },
): readonly GenAIMessage[] {
  const { data: messageSpans } = useConversationMessageSpans({
    projectId,
    traceId,
    startTime,
    enabled: enabled && messages.length > 0,
  })

  return useMemo(() => {
    if (!messageSpans?.length) return messages
    return enrichConversationToolCalls(messages, toMessageSpans(messageSpans))
  }, [messages, messageSpans])
}
