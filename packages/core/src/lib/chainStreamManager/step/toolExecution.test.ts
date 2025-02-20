import { describe, it, expect, vi, beforeAll } from 'vitest'
import * as factories from '../../../tests/factories'
import { Result } from '../../Result'
import {
  AGENT_RETURN_TOOL_NAME,
  LatitudeToolCall,
  LatitudeToolInternalName,
  LogSources,
  Providers,
} from '../../../constants'
import {
  getAgentAsToolCallResponses,
  getLatitudeToolCallResponses,
} from './toolExecution'
import { LatitudeError } from '../../errors'
import { ContentType, MessageRole, ToolMessage } from '@latitude-data/compiler'
import { getAgentToolName } from '../../../services/agents/helpers'
import * as latitudeToolsService from '../../../services/latitudeTools'
import * as runDocumentService from '../../../services/commits/runDocumentAtCommit'
import * as agentsAsToolsService from '../../../services/agents/agentsAsTools'

const MOCKED_TOOL_CALL: LatitudeToolCall = {
  id: '1',
  name: 'tool1' as unknown as LatitudeToolInternalName,
  arguments: { foo: 'bar' },
}

const SUCCESSFUL_RESPONSE = { value: 'success' }

const SUCCESSFUL_RESPONSE_MESSAGE: ToolMessage = {
  role: MessageRole.tool,
  content: [
    {
      type: ContentType.toolResult,
      toolCallId: '1',
      toolName: 'tool1',
      result: { value: 'success' },
      isError: false,
    },
  ],
}

// const { getLatitudeToolCallResponses } = await import('./toolExecution')

describe('getLatitudeToolCallResponses', () => {
  beforeAll(() => {
    vi.resetAllMocks()
    vi.restoreAllMocks()
    vi.spyOn(latitudeToolsService, 'executeLatitudeToolCall').mockResolvedValue(
      Result.ok(SUCCESSFUL_RESPONSE),
    )
  })

  it('executes the correct tool', async () => {
    const responses = getLatitudeToolCallResponses({
      toolCalls: [MOCKED_TOOL_CALL],
      onFinish: vi.fn(),
    })

    await Promise.all(responses)

    expect(latitudeToolsService.executeLatitudeToolCall).toHaveBeenCalledWith({
      id: '1',
      name: 'tool1',
      arguments: { foo: 'bar' },
    })
  })

  it('returns a successful response message', async () => {
    const responses = getLatitudeToolCallResponses({
      toolCalls: [MOCKED_TOOL_CALL],
      onFinish: vi.fn(),
    })

    const resolvedResponses = await Promise.all(responses)

    expect(resolvedResponses.length).toBe(1)
    expect(resolvedResponses[0]).toEqual(SUCCESSFUL_RESPONSE_MESSAGE)
  })

  it('returns a failed response with error message when the tool execution fails', async () => {
    vi.spyOn(latitudeToolsService, 'executeLatitudeToolCall').mockResolvedValue(
      Result.error(new LatitudeError('Failed to execute tool')),
    )

    const responses = getLatitudeToolCallResponses({
      toolCalls: [MOCKED_TOOL_CALL],
      onFinish: vi.fn(),
    })

    const resolvedResponses = await Promise.all(responses)

    expect(resolvedResponses.length).toBe(1)
    expect(resolvedResponses[0]).toEqual({
      ...SUCCESSFUL_RESPONSE_MESSAGE,
      content: [
        {
          ...SUCCESSFUL_RESPONSE_MESSAGE.content[0],
          isError: true,
          result: 'Failed to execute tool',
        },
      ],
    })
  })

  it('runs onFinish callback with each response', async () => {
    vi.spyOn(latitudeToolsService, 'executeLatitudeToolCall').mockResolvedValue(
      Result.ok(SUCCESSFUL_RESPONSE),
    )

    const onFinish = vi.fn()
    const responses = getLatitudeToolCallResponses({
      toolCalls: [MOCKED_TOOL_CALL],
      onFinish,
    })

    await Promise.all(responses)

    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish).toHaveBeenCalledWith(SUCCESSFUL_RESPONSE_MESSAGE)
  })
})

const SUCCESSFUL_AGENT_RESPONSE = {
  lastResponse: Promise.resolve(),
  toolCalls: Promise.resolve([
    {
      id: '1',
      name: AGENT_RETURN_TOOL_NAME,
      arguments: { foo: 'bar' },
    },
  ]),
  error: Promise.resolve(undefined),
} as any

describe('getAgentAsToolCallResponses', () => {
  beforeAll(() => {
    vi.resetAllMocks()
    vi.restoreAllMocks()
    vi.spyOn(runDocumentService, 'runDocumentAtCommit').mockResolvedValue(
      Result.ok(SUCCESSFUL_AGENT_RESPONSE),
    )
  })

  it('executes the sub agent prompt', async () => {
    const { workspace, documents, commit } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        main: factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            agents: ['agents/agent1'],
          },
        }),
        'agents/agent1': factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            type: 'agent',
          },
        }),
      },
    })

    const document = documents.find((doc) => doc.path === 'main')!

    const responses = await getAgentAsToolCallResponses({
      workspace,
      promptSource: {
        document,
        commit,
      },
      toolCalls: [
        {
          name: getAgentToolName('agents/agent1'),
          id: '1',
          arguments: { foo: 'bar' },
        },
      ],
      onFinish: vi.fn(),
    })

    await Promise.all(responses)

    expect(runDocumentService.runDocumentAtCommit).toHaveBeenCalledWith({
      workspace,
      document: documents.find((doc) => doc.path === 'agents/agent1')!,
      commit,
      parameters: { foo: 'bar' },
      source: LogSources.AgentAsTool,
    })
  })

  it('returns a successful response message', async () => {
    const { workspace, documents, commit } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        main: factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            agents: ['agents/agent1'],
          },
        }),
        'agents/agent1': factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            type: 'agent',
          },
        }),
      },
    })

    const document = documents.find((doc) => doc.path === 'main')!

    const responses = await getAgentAsToolCallResponses({
      workspace,
      promptSource: {
        document,
        commit,
      },
      toolCalls: [
        {
          name: getAgentToolName('agents/agent1'),
          id: '1',
          arguments: { foo: 'bar' },
        },
      ],
      onFinish: vi.fn(),
    })

    const resolvedResponses = await Promise.all(responses)

    expect(resolvedResponses).toBeDefined()
    expect(resolvedResponses.length).toBe(1)
    expect(resolvedResponses[0]).toEqual({
      role: MessageRole.tool,
      content: [
        {
          type: ContentType.toolResult,
          toolName: getAgentToolName('agents/agent1'),
          toolCallId: '1',
          isError: false,
          result: (await SUCCESSFUL_AGENT_RESPONSE.toolCalls)[0]!.arguments,
        },
      ],
    })
  })

  it('returns a failed response with error message when the tool execution fails', async () => {
    vi.spyOn(runDocumentService, 'runDocumentAtCommit').mockResolvedValue(
      Result.error(new LatitudeError('Failed to execute tool')),
    )

    const { workspace, documents, commit } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        main: factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            agents: ['agents/agent1'],
          },
        }),
        'agents/agent1': factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            type: 'agent',
          },
        }),
      },
    })

    const document = documents.find((doc) => doc.path === 'main')!

    const responses = await getAgentAsToolCallResponses({
      workspace,
      promptSource: {
        document,
        commit,
      },
      toolCalls: [
        {
          name: getAgentToolName('agents/agent1'),
          id: '1',
          arguments: { foo: 'bar' },
        },
      ],
      onFinish: vi.fn(),
    })

    const resolvedResponses = await Promise.all(responses)

    expect(resolvedResponses).toBeDefined()
    expect(resolvedResponses.length).toBe(1)
    expect(resolvedResponses[0]).toEqual({
      role: MessageRole.tool,
      content: [
        {
          type: ContentType.toolResult,
          toolName: getAgentToolName('agents/agent1'),
          toolCallId: '1',
          isError: true,
          result: 'Failed to execute tool',
        },
      ],
    })
  })

  it('builds agents map if document does not include subagents', async () => {
    vi.spyOn(agentsAsToolsService, 'buildAgentsToolsMap').mockResolvedValue(
      Result.ok({ [getAgentToolName('agents/agent1')]: 'agents/agent1' }),
    )

    const { workspace, documents, commit } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        main: factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            agents: ['agents/agent1'],
          },
        }),
        'agents/agent1': factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            type: 'agent',
          },
        }),
      },
    })

    const document = documents.find((doc) => doc.path === 'main')!

    const responses = await getAgentAsToolCallResponses({
      workspace,
      promptSource: {
        document,
        commit,
      },
      toolCalls: [
        {
          name: getAgentToolName('agents/agent1'),
          id: '1',
          arguments: { foo: 'bar' },
        },
      ],
      onFinish: vi.fn(),
    })

    await Promise.all(responses)

    expect(agentsAsToolsService.buildAgentsToolsMap).toHaveBeenCalledOnce()
  })

  it('fails when subagent does not exist', async () => {
    vi.spyOn(agentsAsToolsService, 'buildAgentsToolsMap').mockResolvedValue(
      Result.ok({}),
    )

    const { workspace, documents, commit } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        main: factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            agents: ['agents/agent1'],
          },
        }),
      },
    })

    const document = documents.find((doc) => doc.path === 'main')!

    const responses = await getAgentAsToolCallResponses({
      workspace,
      promptSource: {
        document,
        commit,
      },
      toolCalls: [
        {
          name: getAgentToolName('agents/agent1'),
          id: '1',
          arguments: { foo: 'bar' },
        },
      ],
      onFinish: vi.fn(),
    })

    const resolvedResponses = await Promise.all(responses)
    expect(resolvedResponses).toBeDefined()
    expect(resolvedResponses.length).toBe(1)
    expect(resolvedResponses[0]).toEqual({
      role: MessageRole.tool,
      content: [
        {
          type: ContentType.toolResult,
          toolName: getAgentToolName('agents/agent1'),
          toolCallId: '1',
          isError: true,
          result: expect.any(String),
        },
      ],
    })
  })

  it('fails when subagent is not of type agent', async () => {
    vi.spyOn(agentsAsToolsService, 'buildAgentsToolsMap').mockResolvedValue(
      Result.ok({}),
    )

    const { workspace, documents, commit } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        main: factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            agents: ['agents/agent1'],
          },
        }),
        'agents/agent1': factories.helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })

    const document = documents.find((doc) => doc.path === 'main')!

    const responses = await getAgentAsToolCallResponses({
      workspace,
      promptSource: {
        document,
        commit,
      },
      toolCalls: [
        {
          name: getAgentToolName('agents/agent1'),
          id: '1',
          arguments: { foo: 'bar' },
        },
      ],
      onFinish: vi.fn(),
    })

    const resolvedResponses = await Promise.all(responses)
    expect(resolvedResponses).toBeDefined()
    expect(resolvedResponses.length).toBe(1)
    expect(resolvedResponses[0]).toEqual({
      role: MessageRole.tool,
      content: [
        {
          type: ContentType.toolResult,
          toolName: getAgentToolName('agents/agent1'),
          toolCallId: '1',
          isError: true,
          result: expect.any(String),
        },
      ],
    })
  })
})
