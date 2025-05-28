import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as factories from '../../../../tests/factories'
import { Commit, Providers, User, Workspace } from '../../../../browser'
import {
  AGENT_RETURN_TOOL_NAME,
  LatitudeTool,
  ToolDefinition,
} from '@latitude-data/constants'
import { Result } from '../../../Result'
import { faker } from '@faker-js/faker'
import { resolveToolsFromConfig } from '../../resolveTools'
import { ContentType, MessageRole } from '@latitude-data/compiler'
import * as runDocumentAtCommitMod from '../../../../services/commits/runDocumentAtCommit'
import * as callIntegrationToolMod from '../../../../services/integrations/McpClient/callTool'
import * as executeLatitudeToolCallMod from '../../../../services/latitudeTools'
import { ResolvedTools, ToolSource } from '../../resolveTools/types'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

const agentAsToolResponse = { response: 'Agent response' }
const integrationToolResponse = { executed: 'integrationTool' }
const latitudeToolResponse = { executed: 'Latitude Tool' }

let user: User
let workspace: Workspace
let commit: Commit

async function setupDocument({
  clientTools,
  subAgents,
  integrations,
  latitudeTools,
  useLegacySchema,
}: {
  clientTools?: Record<string, ToolDefinition>
  subAgents?: string[]
  latitudeTools?: LatitudeTool[]
  integrations?: string[]
  useLegacySchema?: boolean
} = {}) {
  const config: Record<string, unknown> = {}
  if (subAgents) config['agents'] = subAgents

  if (useLegacySchema) {
    if (clientTools) config['tools'] = clientTools
    if (latitudeTools) config['latitudeTools'] = latitudeTools
    if (integrations) {
      throw new Error('integrations not supported with legacy schema')
    }
  } else {
    const tools: (string | Record<string, ToolDefinition>)[] = []
    if (clientTools) {
      Object.keys(clientTools).forEach((toolName) => {
        tools.push({ [toolName]: clientTools[toolName]! })
      })
    }
    if (latitudeTools) {
      latitudeTools.forEach((latitudeTool) => {
        tools.push(`latitude/${latitudeTool}`)
      })
    }
    if (integrations) {
      integrations.forEach((integration) => {
        tools.push(`${integration}/*`)
      })
    }
    if (tools.length) config['tools'] = tools
  }

  const fileName = faker.system.fileName()
  const { documentVersion: document } = await factories.createDocumentVersion({
    user,
    workspace,
    commit,
    path: fileName.slice(0, fileName.indexOf('.')),
    content: factories.helpers.createPrompt({
      provider: 'openai',
      model: 'gpt-4o',
      extraConfig: config,
    }),
  })

  return { document, config: config as LatitudePromptConfig }
}

let getBuiltInToolCallResponses: typeof import('./index').getBuiltInToolCallResponses

describe('getBuiltInToolCallResponses', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()

    vi.spyOn(runDocumentAtCommitMod, 'runDocumentAtCommit').mockResolvedValue(
      //@ts-ignore Ignore the returned type
      Result.ok({
        messages: Promise.resolve([]),
        toolCalls: Promise.resolve([
          {
            id: '1',
            name: AGENT_RETURN_TOOL_NAME,
            arguments: agentAsToolResponse,
          },
        ]),
      }),
    )

    vi.spyOn(callIntegrationToolMod, 'callIntegrationTool').mockResolvedValue(
      Result.ok(integrationToolResponse),
    )

    vi.spyOn(
      executeLatitudeToolCallMod,
      'executeLatitudeToolCall',
    ).mockResolvedValue(Result.ok(latitudeToolResponse))

    getBuiltInToolCallResponses = await import('./index').then(
      (m) => m.getBuiltInToolCallResponses,
    )

    const {
      user: _user,
      workspace: _workspace,
      project: _project,
      providers: _providers,
      commit: _commit,
    } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        subagent: factories.helpers.createPrompt({
          provider: 'openai',
          extraConfig: {
            type: 'agent',
          },
        }),
      },
      integrations: ['custom_mcp'],
      skipMerge: true,
    })

    user = _user
    workspace = _workspace
    commit = _commit
  })

  it('Does not return any response when there are no tool calls', async () => {
    const { document } = await setupDocument()
    const responseMessagePromises = getBuiltInToolCallResponses({
      workspace,
      promptSource: { document, commit },
      toolCalls: [],
      resolvedTools: {},
      onFinish: () => {},
    })

    const responseMessages = await Promise.all(responseMessagePromises)
    expect(responseMessages).toEqual([])
  })

  it('Fails when trying to execute client tools', async () => {
    const clientTools: Record<string, ToolDefinition> = {
      get_weather: {
        description: 'Gets the weather',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The location to get the weather for',
            },
          },
          required: ['location'],
          additionalProperties: false,
        },
      },
    }

    const { document: newSchemaDoc, config: newSchemaConfig } =
      await setupDocument({
        clientTools,
      })
    const { document: oldSchemaDoc, config: oldSchemaConfig } =
      await setupDocument({
        clientTools,
        useLegacySchema: true,
      })

    const toolCalls = [
      {
        id: '1',
        name: 'get_weather',
        arguments: { location: 'New York' },
      },
    ]

    const newSchemaTools = await resolveToolsFromConfig({
      workspace,
      promptSource: { document: newSchemaDoc, commit },
      config: newSchemaConfig,
    }).then((r) => r.unwrap())
    const oldSchemaTools = await resolveToolsFromConfig({
      workspace,
      promptSource: { document: oldSchemaDoc, commit },
      config: oldSchemaConfig,
    }).then((r) => r.unwrap())

    const responseMessagePromisesWithNewSchema = getBuiltInToolCallResponses({
      workspace,
      promptSource: { document: newSchemaDoc, commit },
      toolCalls,
      resolvedTools: newSchemaTools,
      onFinish: () => {},
    })
    const responseMessagesWithNewSchema = await Promise.all(
      responseMessagePromisesWithNewSchema,
    )

    const responseMessagePromisesWithOldSchema = getBuiltInToolCallResponses({
      workspace,
      promptSource: { document: oldSchemaDoc, commit },
      toolCalls,
      resolvedTools: oldSchemaTools,
      onFinish: () => {},
    })
    const responseMessagesWithOldSchema = await Promise.all(
      responseMessagePromisesWithOldSchema,
    )

    expect(responseMessagesWithNewSchema).toEqual([
      {
        role: MessageRole.tool,
        content: [
          {
            type: ContentType.toolResult,
            toolName: 'get_weather',
            toolCallId: '1',
            isError: true,
            result: expect.any(String),
          },
        ],
      },
    ])
    expect(responseMessagesWithOldSchema).toEqual([
      {
        role: MessageRole.tool,
        content: [
          {
            type: ContentType.toolResult,
            toolName: 'get_weather',
            toolCallId: '1',
            isError: true,
            result: expect.any(String),
          },
        ],
      },
    ])
  })

  it('Returns the response from the agent return tool', async () => {
    const { document } = await setupDocument()
    const toolCalls = [
      {
        id: '1',
        name: AGENT_RETURN_TOOL_NAME,
        arguments: { response: 'Agent response' },
      },
    ]

    const resolvedTools = await resolveToolsFromConfig({
      workspace,
      promptSource: { document, commit },
      config: {} as LatitudePromptConfig,
      injectAgentFinishTool: true,
    }).then((r) => r.unwrap())

    const responseMessagePromises = getBuiltInToolCallResponses({
      workspace,
      promptSource: { document, commit },
      toolCalls,
      resolvedTools,
      onFinish: () => {},
    })

    const responseMessages = await Promise.all(responseMessagePromises)
    expect(responseMessages).toEqual([
      {
        role: MessageRole.tool,
        content: [
          {
            type: ContentType.toolResult,
            toolName: AGENT_RETURN_TOOL_NAME,
            toolCallId: '1',
            isError: false,
            result: {},
          },
        ],
      },
    ])
  })

  it('Returns the response from Latitude Tools', async () => {
    const { document: newSchemaDoc, config: newSchemaConfig } =
      await setupDocument({
        latitudeTools: [LatitudeTool.RunCode],
      })

    const newSchemaTools = await resolveToolsFromConfig({
      workspace,
      promptSource: { document: newSchemaDoc, commit },
      config: newSchemaConfig,
    }).then((r) => r.unwrap())

    const toolCalls = [
      {
        id: '1',
        name: Object.keys(newSchemaTools)[0]!,
        arguments: { prompt: 'Hello' },
      },
    ]

    const responseMessagePromisesWithNewSchema = getBuiltInToolCallResponses({
      workspace,
      promptSource: { document: newSchemaDoc, commit },
      toolCalls,
      resolvedTools: newSchemaTools,
      onFinish: () => {},
    })
    const responseMessagesWithNewSchema = await Promise.all(
      responseMessagePromisesWithNewSchema,
    )

    expect(responseMessagesWithNewSchema).toEqual([
      {
        role: MessageRole.tool,
        content: [
          {
            type: ContentType.toolResult,
            toolName: Object.keys(newSchemaTools)[0]!,
            toolCallId: '1',
            isError: false,
            result: latitudeToolResponse,
          },
        ],
      },
    ])
  })

  it('Returns the response from Integration Tools', async () => {
    const { document } = await setupDocument({
      integrations: ['custom_mcp/tool'],
    })

    const resolvedTools: ResolvedTools = {
      custom_mcp_tool: {
        definition: {
          description: 'A custom tool',
          parameters: {
            type: 'object',
            properties: {
              input: {
                type: 'string',
                description: 'The input to the tool',
              },
            },
            required: ['input'],
            additionalProperties: false,
          },
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationName: 'custom_mcp',
          toolName: 'tool',
        },
      },
    }

    const toolCalls = [
      {
        id: '1',
        name: 'custom_mcp_tool',
        arguments: { input: 'Hello' },
      },
    ]
    const responseMessagePromises = getBuiltInToolCallResponses({
      workspace,
      promptSource: { document, commit },
      toolCalls,
      resolvedTools,
      onFinish: () => {},
    })
    const responseMessages = await Promise.all(responseMessagePromises)

    expect(responseMessages).toEqual([
      {
        role: MessageRole.tool,
        content: [
          {
            type: ContentType.toolResult,
            toolName: 'custom_mcp_tool',
            toolCallId: '1',
            isError: false,
            result: integrationToolResponse,
          },
        ],
      },
    ])
  })

  it('Returns the response from Agent As Tools', async () => {
    const { document, config } = await setupDocument({
      subAgents: ['subagent'],
    })

    const resolvedTools = await resolveToolsFromConfig({
      workspace,
      promptSource: { document, commit },
      config,
    }).then((r) => r.unwrap())
    const toolCalls = [
      {
        id: '1',
        name: Object.keys(resolvedTools)[0]!,
        arguments: {},
      },
    ]

    const responseMessagePromises = getBuiltInToolCallResponses({
      workspace,
      promptSource: { document, commit },
      toolCalls,
      resolvedTools,
      onFinish: () => {},
    })
    const responseMessages = await Promise.all(responseMessagePromises)

    expect(responseMessages).toEqual([
      {
        role: MessageRole.tool,
        content: [
          {
            type: ContentType.toolResult,
            toolName: Object.keys(resolvedTools)[0]!,
            toolCallId: '1',
            isError: false,
            result: agentAsToolResponse,
          },
        ],
      },
    ])
  })
})
