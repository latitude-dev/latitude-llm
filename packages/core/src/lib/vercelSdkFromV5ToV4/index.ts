import { omit } from 'lodash-es'
import { StreamType } from '@latitude-data/constants'
import { LegacyVercelSDKVersion4Usage } from '@latitude-data/constants'
import { AIReturn } from '../../services/ai'
import { ToolContent } from 'ai'

type LegacyToolResultContent = Array<
  Omit<ToolContent[number], 'output'> & {
    result: ToolContent[number]['output']
  }
>

export async function convertTokenUsage(
  usage: Awaited<AIReturn<StreamType>['usage']> | undefined,
) {
  const promptTokens = usage?.inputTokens ?? 0
  const completionTokens = usage?.outputTokens ?? 0
  const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens
  return {
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens: usage?.reasoningTokens ?? 0,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
  } satisfies LegacyVercelSDKVersion4Usage
}

export async function convertToolCalls(
  toolCalls: Awaited<AIReturn<StreamType>['toolCalls']> | undefined,
): Promise<
  Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
> {
  return (
    toolCalls?.map((t) => ({
      id: t.toolCallId,
      name: t.toolName,
      // Vercel SDK v4 -> v5 changed the name from `arguments` to `input`
      arguments: t.input as Record<string, unknown>,
    })) || []
  )
}

/**
 * NOTE: Before `result` was of type unknown and was just the value.
 * Now `output` has `type` (text, json, text-error, json-error, content)
 * and the value. I think is fine to let both.
 */
export function convertMessageToolResultContent(
  toolContent: ToolContent,
): LegacyToolResultContent {
  return toolContent.map((c) => ({
    ...c,
    ...omit(c, 'output'),
    result: c.output,
  }))
}
