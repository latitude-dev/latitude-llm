import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import * as factories from '../../../tests/factories'
import { LanguageModelUsage } from 'ai'
import { beforeEach, describe, expect, it } from 'vitest'

import { processResponse } from '.'
import { LogSources, Providers } from '../../../constants'
import { generateUUIDIdentifier } from './../../../lib/generateUUID'
import { buildProviderLogDto } from './saveOrPublishProviderLogs'

let data: ReturnType<typeof buildProviderLogDto>

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
      usage: { promptTokens: 3, completionTokens: 7, totalTokens: 10 },
      messages: [
        {
          role: MessageRole.user,
          content: [{ text: 'Hello', type: 'text' }],
        },
      ],
      toolCalls: [],
      responseText: 'MY TEXT',
    }
  })

  it('process AI provider result', async () => {
    const result = await processResponse({
      documentLogUuid: data.documentLogUuid!,
      // @ts-expect-error - mock implementation
      aiResult: {
        type: 'text' as const,
        toolCalls: new Promise((resolve) => resolve([])),
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
      },
    })

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
    })
  })
})
