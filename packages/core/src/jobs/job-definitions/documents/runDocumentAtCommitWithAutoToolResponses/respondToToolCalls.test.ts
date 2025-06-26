import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { LogSources, Providers } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Commit, DocumentVersion, Workspace } from '../../../../browser'
import * as chainCache from '../../../../services/chains/chainCache'
import * as runDoc from '../../../../services/commits/runDocumentAtCommit'
import { TelemetryContext } from '../../../../telemetry'
import * as factories from '../../../../tests/factories'
import { mockToolRequestsCopilot } from '../../../../tests/helpers'
import {
  LatitudeError,
  UnprocessableEntityError,
} from './../../../../lib/errors'
import { Result } from './../../../../lib/Result'
import { AutogenerateToolResponseCopilotData } from './getCopilotData'

let context: TelemetryContext
let workspace: Workspace
let commit: Commit
let document: DocumentVersion
let copilot: AutogenerateToolResponseCopilotData

const FAKE_TOOL_CALLS = [
  {
    id: 'call_fake_id1',
    name: 'get_the_weather',
    arguments: { location: 'Valencia, Spain' },
  },
  {
    id: 'call_fake_id2',
    name: 'get_the_time',
    arguments: { location: 'Valencia, Spain' },
  },
]

// NOTE: Order of the tests here matters. Be aware and sorry
describe('respondToToolCalls', () => {
  beforeAll(async () => {
    copilot = await mockToolRequestsCopilot()
    const setup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'Latitude' }],
      documents: {
        'test-doc': factories.helpers.createPrompt({
          provider: 'Latitude',
          extraConfig: {
            tools: {
              get_the_weather: {
                description: 'Retrieves the current weather in location',
                parameters: {
                  type: 'object',
                  properties: {
                    location: {
                      type: 'string',
                      description: "location, e.g., 'Valencia, Spain'.",
                    },
                  },
                  required: ['location'],
                  additionalProperties: false,
                },
              },
              get_the_time: {
                description: 'Retrieves the current time in location',
                parameters: {
                  type: 'object',
                  properties: {
                    location: {
                      type: 'string',
                      description: "location, e.g., 'Valencia, Spain'.",
                    },
                  },
                  required: ['location'],
                  additionalProperties: false,
                },
              },
              not_called_tool: {
                description: 'This should not be used to generate the response',
                parameters: {
                  type: 'object',
                  properties: {},
                  additionalProperties: false,
                },
              },
            },
          },
        }),
      },
    })
    workspace = setup.workspace
    document = setup.documents[0]!
    commit = setup.commit
    context = await factories.createTelemetryContext({ workspace })
  })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.restoreAllMocks()
  })

  it('generates response messages and resume conversation', async () => {
    const mockResult = {
      error: Promise.resolve(undefined),
      lastResponse: Promise.resolve({
        providerLog: { uuid: 'log1' },
        object: {
          tool_responses: [
            {
              id: 'call_fake_id1',
              name: 'get_the_weather',
              result: 23,
            },
            {
              id: 'call_fake_id2',
              name: 'get_the_time',
              result: { time: '12:00:00', timezone: 'UTC' },
            },
          ],
        },
      }),
      errorableUuid: 'log1',
      trace: factories.createTelemetryTrace({}),
    }
    vi.spyOn(chainCache, 'getCachedChain').mockResolvedValue({
      // @ts-expect-error - Avoid creating real things, no need
      chain: 'FAKE_CACHED_CHAIN',
      // @ts-expect-error - Avoid creating real things, no need
      previousResponse: 'FAKE_PREVIOUS_RESPONSE',
    })

    vi.spyOn(runDoc, 'runDocumentAtCommit')
    vi.mocked(runDoc.runDocumentAtCommit).mockResolvedValueOnce(
      // @ts-ignore
      Result.ok(mockResult),
    )
    const resumePausedPromptMock = vi.fn()
    vi.doMock(
      '../../../../services/documentLogs/addMessages/resumePausedPrompt',
      () => ({
        resumePausedPrompt: resumePausedPromptMock,
      }),
    )

    const mod = await import('./respondToToolCalls')
    const respondToToolCalls = mod.respondToToolCalls
    await respondToToolCalls({
      context,
      workspace,
      commit,
      document,
      documentLogUuid: 'fake_uuid',
      source: LogSources.Playground,
      copilot,
      toolCalls: FAKE_TOOL_CALLS,
    })

    expect(chainCache.getCachedChain).toHaveBeenCalledWith({
      workspace,
      documentLogUuid: 'fake_uuid',
    })

    expect(runDoc.runDocumentAtCommit).toHaveBeenCalledWith({
      context: expect.anything(),
      workspace: copilot.workspace,
      commit: copilot.commit,
      document: copilot.document,
      parameters: {
        toolSpecifications: {
          get_the_weather: {
            description: 'Retrieves the current weather in location',
            parameters: {
              type: 'object',
              properties: {
                location: {
                  description: "location, e.g., 'Valencia, Spain'.",
                  type: 'string',
                },
              },
              required: ['location'],
              additionalProperties: false,
            },
          },
          get_the_time: {
            description: 'Retrieves the current time in location',
            parameters: {
              type: 'object',
              properties: {
                location: {
                  description: "location, e.g., 'Valencia, Spain'.",
                  type: 'string',
                },
              },
              additionalProperties: false,
              required: ['location'],
            },
          },
        },
        toolCalls: FAKE_TOOL_CALLS,
      },
      customIdentifier: `aigentool-w:${workspace.id}-cmt:${commit.id}-doc:${document.documentUuid}`,
      source: LogSources.Playground,
    })

    expect(resumePausedPromptMock).toHaveBeenCalledWith({
      context: expect.anything(),
      workspace,
      commit,
      document,
      documentLogUuid: 'fake_uuid',
      source: LogSources.Playground,
      pausedChain: 'FAKE_CACHED_CHAIN',
      previousResponse: 'FAKE_PREVIOUS_RESPONSE',
      globalConfig: expect.any(Object),
      responseMessages: [
        {
          role: 'tool',
          content: [
            {
              isError: false,
              result: 23,
              toolCallId: 'call_fake_id1',
              toolName: 'get_the_weather',
              type: 'tool-result',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              isError: false,
              result: { time: '12:00:00', timezone: 'UTC' },
              toolCallId: 'call_fake_id2',
              toolName: 'get_the_time',
              type: 'tool-result',
            },
          ],
        },
      ],
    })
  })

  // TODO: troll test in CI
  it.skip('fails when chain is not found in cache', async () => {
    const mod = await import('./respondToToolCalls')
    const respondToToolCalls = mod.respondToToolCalls
    const result = await respondToToolCalls({
      context,
      workspace,
      commit,
      document,
      documentLogUuid: 'uuid',
      source: LogSources.Playground,
      copilot,
      toolCalls: [],
    })

    expect(result.error).toEqual(
      new UnprocessableEntityError(
        'No cached chain found when calling with tool calls in a batch run document job',
        { toolCalls: [] },
      ),
    )
  })

  it('returns error when copilot result fails', async () => {
    vi.spyOn(chainCache, 'getCachedChain').mockResolvedValue({
      // @ts-expect-error - Avoid creating real things, no need
      chain: 'FAKE_CACHED_CHAIN',
      // @ts-expect-error - Avoid creating real things, no need
      previousResponse: 'FAKE_PREVIOUS_RESPONSE',
    })

    vi.spyOn(runDoc, 'runDocumentAtCommit')
    vi.mocked(runDoc.runDocumentAtCommit).mockResolvedValueOnce(
      Result.error(new LatitudeError('Some error')),
    )
    const mod = await import('./respondToToolCalls')
    const respondToToolCalls = mod.respondToToolCalls
    const result = await respondToToolCalls({
      context,
      workspace,
      commit,
      document,
      documentLogUuid: 'fake_uuid',
      source: LogSources.Playground,
      copilot,
      toolCalls: FAKE_TOOL_CALLS,
    })

    expect(result.error).toEqual(new LatitudeError('Some error'))
  })

  // TODO: troll test in CI
  it.skip('returns error when copilot response fails', async () => {
    const mockResult = {
      error: Promise.resolve(
        new ChainError({
          code: 'SomeError' as RunErrorCodes,
          message: 'Some chain error',
        }),
      ),
      lastResponse: Promise.resolve(undefined),
      errorableUuid: 'log1',
      trace: factories.createTelemetryTrace({}),
    }
    vi.spyOn(chainCache, 'getCachedChain').mockResolvedValue({
      // @ts-expect-error - Avoid creating real things, no need
      chain: 'FAKE_CACHED_CHAIN',
      // @ts-expect-error - Avoid creating real things, no need
      previousResponse: 'FAKE_PREVIOUS_RESPONSE',
    })

    vi.spyOn(runDoc, 'runDocumentAtCommit')
    vi.mocked(runDoc.runDocumentAtCommit).mockResolvedValueOnce(
      // @ts-ignore
      Result.ok(mockResult),
    )
    const mod = await import('./respondToToolCalls')
    const respondToToolCalls = mod.respondToToolCalls
    const result = await respondToToolCalls({
      context,
      workspace,
      commit,
      document,
      documentLogUuid: 'fake_uuid',
      source: LogSources.Playground,
      copilot,
      toolCalls: FAKE_TOOL_CALLS,
    })

    expect(result.error).toEqual(
      new UnprocessableEntityError('Some chain error', {}),
    )
  })
})
