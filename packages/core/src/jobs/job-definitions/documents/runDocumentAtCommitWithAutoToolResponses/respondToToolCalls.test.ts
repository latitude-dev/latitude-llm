import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockToolRequestsCopilot } from '../../../../tests/helpers'
import { Commit, DocumentVersion, Workspace } from '../../../../browser'
import { AutogenerateToolResponseCopilotData } from './getCopilotData'
import * as factories from '../../../../tests/factories'
import { LogSources, Providers } from '@latitude-data/constants'
import * as chainCache from '../../../../services/chains/chainCache'
import * as runDoc from '../../../../services/commits/runDocumentAtCommit'
import {
  LatitudeError,
  Result,
  UnprocessableEntityError,
} from '../../../../lib'
import { ChainError } from '../../../../lib/streamManager/ChainErrors'
import { RunErrorCodes } from '@latitude-data/constants/errors'

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
                      required: ['location'],
                      additionalProperties: false,
                    },
                  },
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
                      required: ['location'],
                      additionalProperties: false,
                    },
                  },
                },
              },
              not_called_tool: {
                description: 'This should not be used to generate the response',
                parameters: { type: 'object', properties: {} },
              },
            },
          },
        }),
      },
    })
    workspace = setup.workspace
    document = setup.documents[0]!
    commit = setup.commit
  })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.restoreAllMocks()
  })

  it('generates response messages and resume conversation', async () => {
    const mockResult = {
      response: Promise.resolve(
        Result.ok({
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
      ),
      errorableUuid: 'log1',
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
    const resumeConversationMock = vi.fn()
    vi.doMock(
      '../../../../services/documentLogs/addMessages/resumeConversation',
      () => ({
        resumeConversation: resumeConversationMock,
      }),
    )

    const mod = await import('./respondToToolCalls')
    const respondToToolCalls = mod.respondToToolCalls
    await respondToToolCalls({
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
                  type: 'string',
                  description: "location, e.g., 'Valencia, Spain'.",
                  required: ['location'],
                  additionalProperties: false,
                },
              },
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
                  required: ['location'],
                  additionalProperties: false,
                },
              },
            },
          },
        },
        toolCalls: FAKE_TOOL_CALLS,
      },
      customIdentifier: `aigentool-w:${workspace.id}-cmt:${commit.id}-doc:${document.documentUuid}`,
      source: LogSources.Playground,
    })

    expect(resumeConversationMock).toHaveBeenCalledWith({
      workspace,
      commit,
      document,
      documentLogUuid: 'fake_uuid',
      source: LogSources.Playground,
      pausedChain: 'FAKE_CACHED_CHAIN',
      previousResponse: 'FAKE_PREVIOUS_RESPONSE',
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

  it('fails when chain is not found in cache', async () => {
    const mod = await import('./respondToToolCalls')
    const respondToToolCalls = mod.respondToToolCalls
    const result = await respondToToolCalls({
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

  it('returns error when copilot response fails', async () => {
    const mockResult = {
      response: Promise.resolve(
        Result.error(
          new ChainError({
            code: RunErrorCodes.ChainCompileError,
            message: 'Some chain error',
          }),
        ),
      ),
      errorableUuid: 'log1',
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
