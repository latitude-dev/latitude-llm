import { beforeEach, describe, expect, it } from 'vitest'
import { LanguageModelUsage } from 'ai'
import { MessageRole } from '@latitude-data/constants/messages'
import * as factories from '../../../tests/factories'

import { StreamType, LogSources, Providers } from '@latitude-data/constants'
import { generateUUIDIdentifier } from './../../../lib/generateUUID'
import { buildProviderLogDto } from './saveOrPublishProviderLogs'
import { processResponse } from './index'
import { AIReturn } from '../../ai'

let data: Omit<
  ReturnType<typeof buildProviderLogDto>,
  'usage' | 'toolCalls'
> & {
  usage: LanguageModelUsage
  toolCalls: AIReturn<StreamType>['toolCalls']
}

describe('ProviderProcessor', () => {
  beforeEach(async () => {
    const prompt = factories.helpers.createPrompt({
      provider: 'openai',
      model: 'gpt-4o',
    })
    const setup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      name: 'Default Project',
      documents: {
        foo: {
          content: prompt,
        },
      },
    })
    const { commit } = await factories.createDraft({
      project: setup.project,
      user: setup.user,
    })
    const { documentLog } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit,
    })
    // @ts-expect-error - mock implementation
    data = {
      workspaceId: setup.workspace.id,
      uuid: generateUUIDIdentifier(),
      source: LogSources.API,
      providerId: setup.providers[0]!.id,
      providerType: setup.providers[0]!.provider,
      documentLogUuid: documentLog.uuid,
      duration: 1000,
      generatedAt: new Date(),
      model: 'gpt-4o',
      config: { model: 'gpt-4o' },
      usage: {
        inputTokens: 3,
        outputTokens: 7,
        totalTokens: 10,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
      messages: [
        {
          role: MessageRole.user,
          content: [{ text: 'Hello', type: 'text' }],
        },
      ],
      responseText: 'MY TEXT',
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
      documentLogUuid: data.documentLogUuid!,
      model,
      provider,
      input: [
        { role: MessageRole.user, content: [{ type: 'text', text: 'Hello' }] },
      ],
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
        usage: new Promise<LanguageModelUsage>((resolve) =>
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
      input: [
        { role: MessageRole.user, content: [{ type: 'text', text: 'Hello' }] },
      ],
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
