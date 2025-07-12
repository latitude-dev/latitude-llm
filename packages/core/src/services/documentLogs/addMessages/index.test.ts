import { v4 as uuid } from 'uuid'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'

import { eq } from 'drizzle-orm'
import {
  Commit,
  DocumentVersion,
  LogSources,
  ProviderApiKey,
  ProviderLog,
  Providers,
  StreamEventTypes,
  User,
  Workspace,
} from '../../../browser'
import { database } from '../../../client'
import { ProviderLogsRepository } from '../../../repositories'
import { providerLogs } from '../../../schema'
import { TelemetryContext } from '../../../telemetry'
import {
  createDocumentLog,
  createProject,
  createTelemetryContext,
} from '../../../tests/factories'
import { testConsumeStream } from '../../../tests/helpers'
import * as aiModule from '../../ai'
import { Result, TypedResult } from './../../../lib/Result'
import { addMessages } from './index'
import { ChainEventTypes } from '@latitude-data/constants'
import { MessageRole } from '@latitude-data/constants/legacyCompiler'

const dummyDoc1Content = `
---
provider: openai
model: gpt-4o
---

This is a test document
<response />
`

let context: TelemetryContext
let document: DocumentVersion
let commit: Commit
let workspace: Workspace
let user: User
let providerApiKey: ProviderApiKey
let providerLog: ProviderLog

async function buildData({
  doc1Content = dummyDoc1Content,
}: { doc1Content?: string } = {}) {
  const {
    workspace: wsp,
    documents,
    commit: cmt,
    user: usr,
    providers,
  } = await createProject({
    providers: [{ type: Providers.OpenAI, name: 'openai' }],
    documents: {
      doc1: doc1Content,
    },
  })
  document = documents.find((d) => d.path === 'doc1')!
  commit = cmt
  workspace = wsp
  user = usr
  providerApiKey = providers[0]!
  const { providerLogs } = await createDocumentLog({
    commit,
    document,
  })
  return {
    providerApiKey,
    workspace,
    document,
    commit,
    user,
    providerLog: providerLogs[providerLogs.length - 1]!,
  }
}

describe('addMessages', () => {
  let mocks: {
    ai: MockInstance
  }

  beforeEach(async () => {
    vi.resetAllMocks()

    const {
      workspace: wsp,
      user: usr,
      document: doc,
      commit: cmt,
      providerLog: pl,
    } = await buildData({
      doc1Content: dummyDoc1Content,
    })
    user = usr
    document = doc
    commit = cmt
    workspace = wsp
    providerLog = pl
    context = await createTelemetryContext({ workspace })

    mocks = {
      ai: vi.spyOn(aiModule, 'ai').mockResolvedValueOnce(
        Result.ok({
          type: 'text',
          text: Promise.resolve('Fake AI generated text'),
          toolCalls: Promise.resolve([]),
          usage: Promise.resolve({
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          }),
          response: Promise.resolve({
            messages: [
              {
                role: 'assistant',
                content: [{ type: 'text', text: 'Fake AI generated text' }],
              },
            ],
          }),
          fullStream: new ReadableStream({
            start(controller) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: 'AI gener',
              })
              controller.enqueue({
                type: 'text-delta',
                textDelta: 'ated text',
              })
              controller.close()
            },
          }),
          providerName: 'openai',
        }) as any as TypedResult<aiModule.AIReturn<'text'>, any>,
      ),
    }
  })

  it('fails if provider log is not found', async () => {
    const result = await addMessages({
      context,
      workspace,
      documentLogUuid: uuid(),
      messages: [],
      source: LogSources.API,
    })

    expect(result.error).toBeDefined()
  })

  it('pass arguments to AI service with text response', async () => {
    providerLog = await database
      .update(providerLogs)
      .set({
        responseText: 'assistant message',
        responseObject: null,
        toolCalls: [],
      })
      .where(eq(providerLogs.id, providerLog.id))
      .returning()
      .then((p) => p[0]!)

    const { stream } = await addMessages({
      context,
      workspace,
      documentLogUuid: providerLog.documentLogUuid!,
      messages: [
        {
          role: MessageRole.user,
          content: [
            {
              type: 'text',
              text: 'user message',
            },
          ],
        },
      ],
      source: LogSources.API,
    }).then((r) => r.unwrap())

    await testConsumeStream(stream)

    expect(mocks.ai).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          ...providerLog.messages,
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'text',
                text: providerLog.responseText,
              },
            ],
            toolCalls: [],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: 'user message',
              },
            ],
          },
        ]),
        config: expect.objectContaining({
          model: 'gpt-4o',
          provider: 'openai',
        }),
        provider: expect.any(Object),
      }),
    )
  })

  it('pass arguments to AI service with object response', async () => {
    providerLog = await database
      .update(providerLogs)
      .set({
        responseText: null,
        responseObject: { object: 'response' },
        toolCalls: [],
      })
      .where(eq(providerLogs.id, providerLog.id))
      .returning()
      .then((p) => p[0]!)

    const { stream } = await addMessages({
      context,
      workspace,
      documentLogUuid: providerLog.documentLogUuid!,
      messages: [
        {
          role: MessageRole.user,
          content: [
            {
              type: 'text',
              text: 'user message',
            },
          ],
        },
      ],
      source: LogSources.API,
    }).then((r) => r.unwrap())

    await testConsumeStream(stream)

    expect(mocks.ai).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          ...providerLog.messages,
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'text',
                text: '{\n  "object": "response"\n}',
              },
            ],
            toolCalls: [],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: 'user message',
              },
            ],
          },
        ]),
        config: expect.objectContaining({
          model: 'gpt-4o',
          provider: 'openai',
        }),
        provider: expect.any(Object),
      }),
    )
  })

  it('pass arguments to AI service with tool calls response', async () => {
    providerLog = await database
      .update(providerLogs)
      .set({
        responseText: null,
        responseObject: null,
        toolCalls: [
          {
            id: 'tool-call-id',
            name: 'tool-call-name',
            arguments: { arg1: 'value1', arg2: 'value2' },
          },
        ],
      })
      .where(eq(providerLogs.id, providerLog.id))
      .returning()
      .then((p) => p[0]!)

    const { stream } = await addMessages({
      context,
      workspace,
      documentLogUuid: providerLog.documentLogUuid!,
      messages: [
        {
          role: MessageRole.user,
          content: [
            {
              type: 'text',
              text: 'user message',
            },
          ],
        },
      ],
      source: LogSources.API,
    }).then((r) => r.unwrap())

    await testConsumeStream(stream)

    expect(mocks.ai).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          ...providerLog.messages,
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'tool-call-id',
                toolName: 'tool-call-name',
                args: { arg1: 'value1', arg2: 'value2' },
              },
              // TODO: Remove this when we store full message history in
              // provider log and we don't have to manually build response
              // anymore
              {
                type: 'text',
                text: '',
              },
            ],
            toolCalls: providerLog.toolCalls,
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: 'user message',
              },
            ],
          },
        ]),
        config: expect.objectContaining({
          model: 'gpt-4o',
          provider: 'openai',
        }),
        provider: expect.any(Object),
      }),
    )
  })

  it('pass arguments to AI service with tool calls and text response', async () => {
    providerLog = await database
      .update(providerLogs)
      .set({
        responseText: 'assistant message',
        responseObject: null,
        toolCalls: [
          {
            id: 'tool-call-id',
            name: 'tool-call-name',
            arguments: { arg1: 'value1', arg2: 'value2' },
          },
        ],
      })
      .where(eq(providerLogs.id, providerLog.id))
      .returning()
      .then((p) => p[0]!)

    const { stream } = await addMessages({
      context,
      workspace,
      documentLogUuid: providerLog.documentLogUuid!,
      messages: [
        {
          role: MessageRole.user,
          content: [
            {
              type: 'text',
              text: 'user message',
            },
          ],
        },
      ],
      source: LogSources.API,
    }).then((r) => r.unwrap())

    await testConsumeStream(stream)

    expect(mocks.ai).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          ...providerLog.messages,
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'tool-call-id',
                toolName: 'tool-call-name',
                args: { arg1: 'value1', arg2: 'value2' },
              },
              {
                type: 'text',
                text: providerLog.responseText,
              },
            ],
            toolCalls: providerLog.toolCalls,
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: 'user message',
              },
            ],
          },
        ]),
        config: expect.objectContaining({
          model: 'gpt-4o',
          provider: 'openai',
        }),
        provider: expect.any(Object),
      }),
    )
  })

  it('returns chain stream', async () => {
    const { stream } = await addMessages({
      context,
      workspace,
      documentLogUuid: providerLog.documentLogUuid!,
      messages: [
        {
          role: MessageRole.user,
          content: [
            {
              type: 'text',
              text: 'This is a user message',
            },
          ],
        },
      ],
      source: LogSources.API,
    }).then((r) => r.unwrap())

    const { value } = await testConsumeStream(stream)
    const log = await new ProviderLogsRepository(workspace.id)
      .findLastByDocumentLogUuid(providerLog.documentLogUuid!)
      .then((r) => r.unwrap())

    expect(value).toEqual([
      {
        event: StreamEventTypes.Latitude,
        data: expect.objectContaining({
          type: ChainEventTypes.ChainStarted,
        }),
      },
      {
        event: StreamEventTypes.Latitude,
        data: expect.objectContaining({
          type: ChainEventTypes.StepStarted,
        }),
      },
      {
        event: StreamEventTypes.Latitude,
        data: expect.objectContaining({
          type: ChainEventTypes.ProviderStarted,
        }),
      },
      {
        event: StreamEventTypes.Provider,
        data: { type: 'text-delta', textDelta: 'AI gener' },
      },
      {
        event: StreamEventTypes.Provider,
        data: { type: 'text-delta', textDelta: 'ated text' },
      },
      {
        event: StreamEventTypes.Latitude,
        data: expect.objectContaining({
          type: ChainEventTypes.ProviderCompleted,
          providerLogUuid: log.uuid,
        }),
      },
      {
        event: StreamEventTypes.Latitude,
        data: expect.objectContaining({
          type: ChainEventTypes.StepCompleted,
        }),
      },
      {
        event: StreamEventTypes.Latitude,
        data: expect.objectContaining({
          type: ChainEventTypes.ChainCompleted,
          uuid: providerLog.documentLogUuid!,
          finishReason: 'stop',
        }),
      },
    ])
  })

  it('returns chain response', async () => {
    const result = (
      await addMessages({
        context,
        workspace,
        documentLogUuid: providerLog.documentLogUuid!,
        messages: [
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: 'This is a user message',
              },
            ],
          },
        ],
        source: LogSources.API,
      })
    ).unwrap()

    const response = await result.response
    const log = await new ProviderLogsRepository(workspace.id)
      .findLastByDocumentLogUuid(providerLog.documentLogUuid!)
      .then((r) => r.unwrap())

    expect(response).toEqual({
      streamType: 'text',
      text: 'Fake AI generated text',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      toolCalls: [],
      documentLogUuid: providerLog.documentLogUuid,
      providerLog: log,
    })
  })

  it('handles error response', async () => {
    mocks.ai = vi.spyOn(aiModule, 'ai').mockResolvedValueOnce(
      Result.ok({
        fullStream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'error',
              error: new Error('provider error'),
            })

            controller.close()
          },
        }),
      }) as any as TypedResult<aiModule.AIReturn<'text'>, any>,
    )

    const result = await addMessages({
      context,
      workspace,
      documentLogUuid: providerLog.documentLogUuid!,
      messages: [
        {
          role: MessageRole.user,
          content: [
            {
              type: 'text',
              text: 'user message',
            },
          ],
        },
      ],
      source: LogSources.API,
    }).then((r) => r.unwrap())

    const { value: stream } = await testConsumeStream(result.stream)

    expect(stream).toEqual(
      expect.arrayContaining([
        {
          event: StreamEventTypes.Latitude,
          data: expect.objectContaining({
            type: ChainEventTypes.ChainError,
          }),
        },
      ]),
    )
  })
})
