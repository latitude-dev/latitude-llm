import { ChainStepResponse, StreamType } from '@latitude-data/constants/ai'
import { AIReturn } from '../../ai'
import {
  AssistantMessage,
  MessageRole,
} from '@latitude-data/constants/legacyCompiler'
import * as vercelSdkFromV5ToV4 from '../../../lib/vercelSdkFromV5ToV4'

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
    usage: await vercelSdkFromV5ToV4.convertTokenUsage(aiResult.usage),
    reasoning: await aiResult.reasoning,
    toolCalls: await vercelSdkFromV5ToV4.convertToolCalls(aiResult.toolCalls),
  }
}

async function buildOutput(
  aiResult: AIReturn<StreamType>,
): Promise<ChainStepResponse<StreamType>['output']> {
  const messages = (await aiResult.response).messages
  if (!messages) return []

  return messages.map((m) => {
    if (m.role === 'assistant') {
      // FIXME: File content responses are wrong. Our types says the content is in
      // m.content[0].file but Vercel SDK returns it in m.content[0].data
      // We need to fix that in a future release
      return {
        role: 'assistant',
        content: m.content,
      } as AssistantMessage
    } else {
      return {
        role: 'tool',
        content: vercelSdkFromV5ToV4.convertMessageToolContent(m.content),
      }
    }
  })
}

/**
 * When a assistant message is stopped by the user, we must create a uncomplete provider log with the information we
 * have to keep the message chain alive
 **/
export async function fakeResponse({
  documentLogUuid,
  accumulatedText,
}: {
  documentLogUuid?: string
  accumulatedText: { text: string }
}): Promise<ChainStepResponse<StreamType>> {
  return {
    streamType: 'text',
    documentLogUuid,
    text: accumulatedText.text,
    output: [fakeAssistantMessage(accumulatedText.text)],
    usage: nullLanguageModelUse,
    reasoning: undefined,
    toolCalls: [],
  }
}

const nullLanguageModelUse = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
}

const fakeAssistantMessage = (accumulatedText: string): AssistantMessage => {
  return {
    role: MessageRole.assistant,
    content: [
      {
        type: 'text',
        text: accumulatedText,
      },
    ],
    toolCalls: [],
  }
}
