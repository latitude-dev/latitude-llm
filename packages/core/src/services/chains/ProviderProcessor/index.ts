import { omit } from 'lodash-es'
import { ChainStepResponse, StreamType } from '@latitude-data/constants/ai'
import { AIReturn } from '../../ai'
import { AssistantMessage } from '@latitude-data/constants/legacyCompiler'

function parseObject(text: string) {
  const parsed = text
  try {
    return JSON.parse(parsed)
  } catch {
    return {}
  }
}

/**
 * This function is responsible for processing the AI response
 *
 * TODO(compiler)
 * Remove all legacy stuff and try to use latest Vercel SDK types.
 * The problem with that is that it will change the output of our API and
 * SDKs.
 */
export async function processResponse({
  aiResult,
  documentLogUuid,
}: {
  aiResult: Awaited<AIReturn<StreamType>>
  documentLogUuid?: string
}): Promise<ChainStepResponse<StreamType>> {
  const isObject = aiResult.type === 'object'
  const text = await aiResult.text
  const output = await buildOutput(aiResult)

  return {
    streamType: aiResult.type,
    documentLogUuid,
    text,
    object: isObject ? parseObject(text) : undefined,
    output,
    usage: translateUsageToLegacy(await aiResult.usage),
    reasoning: await aiResult.reasoning,
    toolCalls: (await aiResult.toolCalls).map((t) => ({
      id: t.toolCallId,
      name: t.toolName,
      // Vercel SDK v4 -> v5 changed the name from `arguments` to `input`
      arguments: t.input as Record<string, unknown>,
    })),
  }
}

function translateUsageToLegacy(usage: Awaited<AIReturn<StreamType>['usage']>) {
  return {
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
    reasoningTokens: usage.reasoningTokens,
    cachedInputTokens: usage.cachedInputTokens,
  }
}

async function buildOutput(
  aiResult: AIReturn<StreamType>,
): Promise<ChainStepResponse<StreamType>['output']> {
  const messages = (await aiResult.response).messages
  if (!messages) return []

  return messages.map((m) => {
    if (m.role === 'assistant') {
      return {
        role: 'assistant',
        content: m.content,
      } as AssistantMessage
    } else {
      return {
        role: 'tool',
        content: m.content.map((c) => ({
          ...omit(c, 'output'),
          result: c.output,
        })),
      }
    }
  })
}
