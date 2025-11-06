import {
  AssistantModelMessage,
  ToolModelMessage,
  ToolResultPart,
  TextPart,
} from 'ai'
import {
  MessageRole,
  AssistantMessage,
  ToolMessage,
  ToolCall,
  MessageContent,
  TextContent,
  ToolContent,
  FileContent,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { AIReturn } from '../../services/ai'
import { StreamType } from '../../constants'
import { ResolvedToolsDict } from '@latitude-data/constants/tools'

type NormalizedToolResult = string | Record<string, unknown> | MessageContent[]

function normalizeToolResult(
  output: ToolResultPart['output'],
): NormalizedToolResult {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value
    case 'json':
    case 'error-json':
      return output.value as Record<string, unknown>
    case 'content':
      return output.value.map((v) =>
        v.type === 'text'
          ? ({ type: 'text', text: v.text } as TextContent)
          : ({
              type: 'file',
              file: v.data,
              mimeType: v.mediaType,
            } as FileContent),
      )
  }
}

function convertToolMessage(msg: ToolModelMessage): ToolMessage {
  const contents = msg.content.map(
    (part) =>
      ({
        type: 'tool-result',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        result: normalizeToolResult(part.output),
        isError: part.output.type.startsWith('error'),
      }) satisfies ToolContent,
  )

  return { role: MessageRole.tool, content: contents }
}

function convertAssistantMessage(
  msg: AssistantModelMessage,
  resolvedTools?: ResolvedToolsDict,
) {
  const parts = Array.isArray(msg.content)
    ? msg.content
    : [{ type: 'text', text: msg.content } satisfies TextPart]

  const toolCalls: ToolCall[] = []
  const contents: MessageContent[] = []

  for (const part of parts) {
    switch (part.type) {
      case 'text':
        contents.push({ type: 'text', text: part.text })
        break
      case 'file':
        if (part.mediaType.startsWith('image/')) {
          contents.push({ type: 'image', image: part.data })
        } else {
          contents.push({
            type: 'file',
            file: part.data,
            mimeType: part.mediaType,
          })
        }
        break
      case 'reasoning':
        contents.push({ type: 'reasoning', text: part.text })
        break
      case 'tool-call': {
        const toolReq: ToolRequestContent = {
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: part.input as Record<string, unknown>,
        }

        const resolvedTool = resolvedTools?.[part.toolName]
        if (resolvedTool) {
          toolReq._sourceData = resolvedTool.sourceData
        }

        contents.push(toolReq)
        toolCalls.push({
          id: part.toolCallId,
          name: part.toolName,
          arguments: part.input as Record<string, unknown>,
          _sourceData: resolvedTool?.sourceData,
        })
        break
      }
      case 'tool-result':
        contents.push({
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: normalizeToolResult(part.output),
          isError: part.output.type.startsWith('error'),
        })
        break
    }
  }

  return {
    role: MessageRole.assistant,
    content: contents,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
  } satisfies AssistantMessage
}

type AIMessages = Awaited<AIReturn<StreamType>['response']>['messages']

export type LegacyMessage = AssistantMessage | ToolMessage
export function convertResponseMessages({
  messages,
  resolvedTools,
}: {
  messages: AIMessages | undefined
  resolvedTools?: ResolvedToolsDict
}): LegacyMessage[] {
  if (!messages || messages.length === 0) return []

  return messages.map((msg) => {
    if (msg.role === 'assistant') {
      return convertAssistantMessage(msg, resolvedTools)
    }
    if (msg.role === 'tool') {
      return convertToolMessage(msg)
    }

    const unknowMsg = JSON.stringify(msg, null, 2)
    throw new ChainError({
      code: RunErrorCodes.InvalidResponseFormatError,
      message: `Unsupported provider message role: ${unknowMsg} in response`,
    })
  })
}
