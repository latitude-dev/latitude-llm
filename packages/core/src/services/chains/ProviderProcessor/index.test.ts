import { MessageRole } from '@latitude-data/compiler'
import * as factories from '@latitude-data/core/factories'
import { LanguageModelUsage, TextStreamPart } from 'ai'
import { beforeEach, describe, expect, it } from 'vitest'

import { ProviderApiKey } from '../../../browser'
import { LogSources, Providers, RunErrorCodes } from '../../../constants'
import { generateUUIDIdentifier } from '../../../lib'
import { ChainError } from '../ChainErrors'
import {
  AsyncStreamIteable,
  TOOLS,
} from '../ChainStreamConsumer/consumeStream.test'
import { ProviderProcessor } from './index'
import { LogData } from './saveOrPublishProviderLogs'

let data: LogData<'text'>
let apiProvider: ProviderApiKey
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
    apiProvider = setup.providers[0]!
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
      usage: { promptTokens: 3, completionTokens: 7, totalTokens: 10 },
      messages: [
        {
          role: MessageRole.user,
          content: 'MY TEXT',
        },
      ],
      toolCalls: [],
      responseText: 'MY TEXT',
    }
  })

  it('process AI provider result', async () => {
    const processor = new ProviderProcessor({
      apiProvider,
      source: data.source,
      config: data.config,
      messages: data.messages,
      saveSyncProviderLogs: true,
      errorableUuid: data.documentLogUuid!,
    })
    const result = await processor
      .call({
        aiResult: {
          type: 'text' as 'text',
          data: {
            toolCalls: new Promise((resolve) => resolve([])),
            text: new Promise<string>((resolve) => resolve(data.responseText)),
            usage: new Promise<LanguageModelUsage>((resolve) =>
              resolve(data.usage),
            ),
            fullStream: new AsyncStreamIteable<TextStreamPart<TOOLS>>({
              start: (controller) => {
                controller.close()
              },
            }),
          },
        },
        startTime: Date.now(),
        finishReason: 'stop',
      })
      .then((r) => r.unwrap())

    expect(result).toEqual({
      streamType: 'text',
      text: 'MY TEXT',
      toolCalls: [],
      usage: {
        promptTokens: 3,
        completionTokens: 7,
        totalTokens: 10,
      },
      documentLogUuid: data.documentLogUuid,
      providerLog: expect.objectContaining({
        id: expect.any(Number),
        costInMillicents: 7,
        tokens: 10,
        finishReason: 'stop',
        messages: data.messages,
        toolCalls: [],
        model: data.model,
        config: data.config,
        responseObject: null,
        responseText: 'MY TEXT',
        source: 'api',
        documentLogUuid: data.documentLogUuid,
      }),
    })
  })

  it('fails if type is not text or object', async () => {
    const processor = new ProviderProcessor({
      apiProvider,
      source: data.source,
      config: data.config,
      messages: data.messages,
      saveSyncProviderLogs: true,
      errorableUuid: data.documentLogUuid!,
    })
    const result = await processor.call({
      aiResult: {
        // @ts-expect-error - invalid type
        type: 'another_invalid_type',
        data: {
          toolCalls: new Promise((resolve) => resolve([])),
          text: new Promise<string>((resolve) => resolve(data.responseText)),
          usage: new Promise<LanguageModelUsage>((resolve) =>
            resolve(data.usage),
          ),
          fullStream: new AsyncStreamIteable<TextStreamPart<TOOLS>>({
            start: (controller) => {
              controller.close()
            },
          }),
        },
      },
      startTime: Date.now(),
      finishReason: 'stop',
    })

    expect(result.error).toEqual(
      new ChainError({
        code: RunErrorCodes.UnsupportedProviderResponseTypeError,
        message:
          'Invalid stream type another_invalid_type result is not a textStream or objectStream',
      }),
    )
  })
})
