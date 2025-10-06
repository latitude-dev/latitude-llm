import {
  ChainStepResponse,
  EMPTY_USAGE,
  StreamType,
} from '@latitude-data/constants/ai'
import { AIReturn } from '../../ai'
import {
  AssistantMessage,
  MessageRole,
} from '@latitude-data/constants/legacyCompiler'
import * as vercelSdkFromV5ToV4 from '../../../lib/vercelSdkFromV5ToV4'
import { convertResponseMessages } from '../../../lib/vercelSdkFromV5ToV4/convertResponseMessages'

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
  const response = await aiResult.response
  const messages = response.messages
  const output = convertResponseMessages({ messages })
  const reasoning = await aiResult.reasoning

  return {
    streamType: aiResult.type,
    documentLogUuid,
    text: text ?? '',
    object: isObject ? parseObject(text ?? '') : undefined,
    output,
    usage: await vercelSdkFromV5ToV4.convertTokenUsage(aiResult.usage),
    reasoning,
    toolCalls: await vercelSdkFromV5ToV4.convertToolCalls(aiResult.toolCalls),
  }
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
    usage: EMPTY_USAGE(),
    reasoning: undefined,
    toolCalls: [],
  }
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
