import { beforeEach, describe, expect, it } from 'vitest'

import { Providers, StreamType } from '@latitude-data/constants'
import { processResponse } from './index'
import { AIReturn } from '../../ai'

type TestData = {
  documentLogUuid: string
  responseText: string
  usage: Awaited<AIReturn<StreamType>['usage']>
  toolCalls: AIReturn<StreamType>['toolCalls']
}

let data: TestData

describe('ProviderProcessor', () => {
  beforeEach(async () => {
    data = {
      documentLogUuid: 'test-document-log-uuid',
      responseText: 'MY TEXT',
      usage: {
        inputTokens: 3,
        outputTokens: 7,
        totalTokens: 10,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
      toolCalls: new Promise((resolve) =>
        resolve([
          {
            type: 'tool-call',
            toolCallId: '1',
            toolName: 'tool1',
            input: { param1: 'abc' },
          },
        ]),
      ) as AIReturn<StreamType>['toolCalls'],
    }
  })

  it('process AI provider result', async () => {
    const model = 'gpt-4o'
    const provider = Providers.OpenAI
    const result = await processResponse({
      documentLogUuid: data.documentLogUuid,
      model,
      provider,
      input: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      // @ts-expect-error - mock implementation
      aiResult: {
        type: 'text' as const,
        toolCalls: data.toolCalls,
        reasoning: new Promise<string | undefined>((resolve) =>
          resolve(undefined),
        ),
        text: new Promise<string>((resolve) =>
          resolve(data.responseText as string),
        ),
        usage: new Promise<Awaited<AIReturn<StreamType>['usage']>>((resolve) =>
          resolve(data.usage),
        ),
        providerName: Providers.OpenAI,
        providerMetadata: new Promise<undefined>((resolve) =>
          resolve(undefined),
        ),
        // @ts-expect-error - mock implementation
        response: new Promise((resolve) => resolve({})),
      },
    })

    expect(result).toEqual({
      streamType: 'text',
      text: 'MY TEXT',
      toolCalls: [
        {
          id: '1',
          name: 'tool1',
          arguments: { param1: 'abc' },
        },
      ],
      cost: expect.any(Number),
      object: undefined,
      model,
      provider,
      input: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      output: [],
      reasoning: undefined,
      usage: {
        inputTokens: 3,
        outputTokens: 7,
        promptTokens: 3,
        completionTokens: 7,
        totalTokens: 10,
        cachedInputTokens: 0,
        reasoningTokens: 0,
      },
      documentLogUuid: data.documentLogUuid,
    })
  })
})
