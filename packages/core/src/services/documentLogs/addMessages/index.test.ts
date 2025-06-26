import { ContentType, MessageRole } from '@latitude-data/compiler'
import { v4 as uuid } from 'uuid'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'

import { ChainEventTypes } from '@latitude-data/constants'
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
      ai: vi.spyOn(aiModule, 'ai').mockResolvedValue(
        Result.ok({
          type: 'text',
          text: Promise.resolve('Fake AI generated text'),
          toolCalls: Promise.resolve([]),
          usage: Promise.resolve({
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
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
              type: ContentType.text,
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
                type: ContentType.text,
                text: providerLog.responseText,
              },
            ],
            toolCalls: [],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: ContentType.text,
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
              type: ContentType.text,
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
                type: ContentType.text,
                text: '{\n  "object": "response"\n}',
              },
            ],
            toolCalls: [],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: ContentType.text,
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
              type: ContentType.text,
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
                type: ContentType.toolCall,
                toolCallId: 'tool-call-id',
                toolName: 'tool-call-name',
                args: { arg1: 'value1', arg2: 'value2' },
              },
            ],
            toolCalls: providerLog.toolCalls,
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: ContentType.text,
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
              type: ContentType.text,
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
                type: ContentType.text,
                text: providerLog.responseText,
              },
              {
                type: ContentType.toolCall,
                toolCallId: 'tool-call-id',
                toolName: 'tool-call-name',
                args: { arg1: 'value1', arg2: 'value2' },
              },
            ],
            toolCalls: providerLog.toolCalls,
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: ContentType.text,
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
              type: ContentType.text,
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
                type: ContentType.text,
                text: 'This is a user message',
              },
            ],
          },
        ],
        source: LogSources.API,
      })
    ).unwrap()

    const response = await result.lastResponse
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

  // TODO: troll test in CI
  it.skip('handles error response', async () => {
    mocks.ai = vi.spyOn(aiModule, 'ai').mockResolvedValue(
      Result.ok({
        type: 'text',
        data: {
          text: Promise.resolve(''),
          toolCalls: Promise.resolve([]),
          usage: Promise.resolve({
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          }),
          fullStream: new ReadableStream({
            start(controller) {
              controller.enqueue({
                type: 'error',
                error: new Error('provider error'),
              })
              controller.close()
            },
          }),
          providerName: 'openai',
        },
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
              type: ContentType.text,
              text: 'user message',
            },
          ],
        },
      ],
      source: LogSources.API,
    }).then((r) => r.unwrap())
    const { value: stream } = await testConsumeStream(result.stream)
    const error = await result.error

    expect(stream).toEqual([
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
        event: StreamEventTypes.Latitude,
        data: expect.objectContaining({
          type: ChainEventTypes.ChainError,
          error: expect.objectContaining({
            message: 'Openai returned this error: provider error',
          }),
        }),
      },
    ])
    expect(error).toEqual(
      new Error('Openai returned this error: provider error'),
    )
  })

  it('handles tool calls response', async () => {
    mocks.ai = vi.spyOn(aiModule, 'ai').mockResolvedValue(
      Result.ok({
        type: 'text',
        text: Promise.resolve('assistant message'),
        toolCalls: Promise.resolve([
          {
            toolCallId: 'tool-call-id',
            toolName: 'tool-call-name',
            args: { arg1: 'value1', arg2: 'value2' },
          },
        ]),
        usage: Promise.resolve({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }),
        fullStream: new ReadableStream({
          start: (controller) => controller.close(),
        }),
        providerName: 'openai',
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
              type: ContentType.text,
              text: 'user message',
            },
          ],
        },
      ],
      source: LogSources.API,
    }).then((r) => r.unwrap())
    const { value: stream } = await testConsumeStream(result.stream)
    const response = await result.lastResponse
    const log = await new ProviderLogsRepository(workspace.id)
      .findLastByDocumentLogUuid(providerLog.documentLogUuid!)
      .then((r) => r.unwrap())

    expect(stream).toEqual([
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
        event: StreamEventTypes.Latitude,
        data: expect.objectContaining({
          type: ChainEventTypes.ProviderCompleted,
        }),
      },
      {
        event: StreamEventTypes.Latitude,
        data: expect.objectContaining({
          type: ChainEventTypes.ToolsRequested,
          tools: [
            {
              id: 'tool-call-id',
              name: 'tool-call-name',
              arguments: {
                arg1: 'value1',
                arg2: 'value2',
              },
            },
          ],
        }),
      },
    ])
    expect(response).toEqual(
      expect.objectContaining({
        text: 'assistant message',
        toolCalls: [
          {
            id: 'tool-call-id',
            name: 'tool-call-name',
            arguments: { arg1: 'value1', arg2: 'value2' },
          },
        ],
        providerLog: expect.objectContaining({
          messages: [
            ...log.messages.slice(0, -1),
            {
              role: MessageRole.user,
              content: [{ type: ContentType.text, text: 'user message' }],
            },
          ],
          responseText: 'assistant message',
          responseObject: null,
          toolCalls: [
            {
              id: 'tool-call-id',
              name: 'tool-call-name',
              arguments: { arg1: 'value1', arg2: 'value2' },
            },
          ],
        }),
      }),
    )
  })
})
