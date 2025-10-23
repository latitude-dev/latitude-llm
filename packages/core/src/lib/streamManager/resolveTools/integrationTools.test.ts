import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { IntegrationType } from '@latitude-data/constants'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import { LogSources } from '../../../constants'
import { BadRequestError, NotFoundError, LatitudeError } from '../../errors'
import { Result } from '../../Result'
import * as factories from '../../../tests/factories'
import { resolveIntegrationTools } from './integrationTools'
import { DefaultStreamManager } from '../defaultStreamManager'
import * as listToolsModule from '../../../services/integrations'
import * as callIntegrationToolModule from '../../../services/integrations/McpClient/callTool'
import type { Workspace } from '../../../schema/models/types/Workspace'
import type { ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import type { IntegrationDto } from '../../../schema/models/types/Integration'
import type { McpTool } from '@latitude-data/constants'
import type { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

describe('resolveIntegrationTools', () => {
  let workspace: Workspace
  let provider: ProviderApiKey
  let integration: IntegrationDto
  let streamManager: DefaultStreamManager

  beforeEach(async () => {
    const setup = await factories.createProject({
      documents: {},
      skipMerge: true,
    })
    workspace = setup.workspace
    provider = setup.providers[0]!

    const context = factories.createTelemetryContext({ workspace })

    streamManager = new DefaultStreamManager({
      workspace,
      promptSource: {
        document: {
          id: 1,
          documentUuid: 'test-doc',
        } as any,
        commit: { id: 1, uuid: 'test-commit' } as any,
      },
      source: LogSources.API,
      context,
      provider,
      config: { provider: provider.name, model: 'test-model' },
      messages: [
        { role: MessageRole.user, content: [{ type: 'text', text: 'test' }] },
      ],
      output: 'no-schema',
      schema: {},
    })

    integration = await factories.createIntegration({
      workspace,
      name: 'test-integration',
      type: IntegrationType.ExternalMCP,
      configuration: {
        url: 'https://test.mcp/sse',
      },
    })

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('with no tools in config', () => {
    it('returns empty object when tools is undefined', async () => {
      const config: LatitudePromptConfig = { provider: 'test', model: 'test' }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual({})
    })
  })

  describe('with old schema (object format)', () => {
    it('returns empty object for old schema with tool object', async () => {
      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: {
          myTool: {
            description: 'A test tool',
            parameters: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        },
      }

      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual({})
    })
  })

  it('returns empty object when tools array is empty', async () => {
    const config: LatitudePromptConfig = {
      provider: 'test',
      model: 'test',
      tools: [],
    }
    const result = await resolveIntegrationTools({
      config,
      streamManager,
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toEqual({})
  })

  it('filters out latitude/ tools', async () => {
    const config: LatitudePromptConfig = {
      provider: 'test',
      model: 'test',
      tools: ['latitude/custom-tool'],
    }
    const result = await resolveIntegrationTools({
      config,
      streamManager,
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toEqual({})
  })

  it('returns error for invalid tool format (missing slash)', async () => {
    const config: LatitudePromptConfig = {
      provider: 'test',
      model: 'test',
      tools: ['invalid-tool-format'],
    }
    const result = await resolveIntegrationTools({
      config,
      streamManager,
    })

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toContain('Invalid tool')
    expect(result.error?.message).toContain('invalid-tool-format')
  })

  it('returns error for invalid tool format (empty integration name)', async () => {
    const config: LatitudePromptConfig = {
      provider: 'test',
      model: 'test',
      tools: ['/toolname'],
    }
    const result = await resolveIntegrationTools({
      config,
      streamManager,
    })

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toContain('Invalid tool')
  })

  it('returns error for invalid tool format (empty tool name)', async () => {
    const config: LatitudePromptConfig = {
      provider: 'test',
      model: 'test',
      tools: ['integration/'],
    }
    const result = await resolveIntegrationTools({
      config,
      streamManager,
    })

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toContain('Invalid tool')
  })

  it('returns error when integration is not found', async () => {
    const config: LatitudePromptConfig = {
      provider: 'test',
      model: 'test',
      tools: ['nonexistent/search'],
    }
    const result = await resolveIntegrationTools({
      config,
      streamManager,
    })

    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain('Integration not found')
  })

  it('returns error when listTools fails', async () => {
    const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
    listToolsSpy.mockResolvedValue(
      Result.error(new LatitudeError('Failed to list tools')),
    )

    const config: LatitudePromptConfig = {
      provider: 'test',
      model: 'test',
      tools: ['test-integration/search'],
    }
    const result = await resolveIntegrationTools({
      config,
      streamManager,
    })

    expect(result.error).toBeTruthy()
    expect(result.error?.message).toContain('Failed to list tools')
  })

  describe('with specific tool name', () => {
    it('successfully resolves a single tool', async () => {
      const mockTool: McpTool = {
        name: 'search',
        displayName: 'Search Tool',
        description: 'Searches for stuff',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          additionalProperties: false,
        },
      }

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok([mockTool]))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/search'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const resolvedTools = result.unwrap()
      expect(Object.keys(resolvedTools)).toEqual(['search'])
      expect(resolvedTools.search).toBeDefined()
      expect(resolvedTools.search.sourceData).toEqual({
        source: ToolSource.Integration,
        integrationId: integration.id,
        toolLabel: 'Search Tool',
        imageUrl: undefined,
      })
      expect(resolvedTools.search.definition).toBeDefined()
      expect((resolvedTools.search.definition as any).description).toBe(
        'Searches for stuff',
      )
    })

    it('returns error when specific tool is not found in integration', async () => {
      const mockTool: McpTool = {
        name: 'differentTool',
        displayName: 'Different Tool',
        description: 'A different tool',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      }

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok([mockTool]))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/search'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.error).toBeInstanceOf(NotFoundError)
      expect(result.error?.message).toContain(
        "Tool 'search' not found in Integration 'test-integration'",
      )
    })

    it('truncates tool description to 1023 characters', async () => {
      const longDescription = 'a'.repeat(2000)
      const mockTool: McpTool = {
        name: 'search',
        displayName: 'Search Tool',
        description: longDescription,
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      }

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok([mockTool]))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/search'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const resolvedTools = result.unwrap()
      expect((resolvedTools.search.definition as any).description).toHaveLength(
        1023,
      )
    })

    it('handles tool with no description', async () => {
      const mockTool: McpTool = {
        name: 'search',
        displayName: 'Search Tool',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      }

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok([mockTool]))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/search'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const resolvedTools = result.unwrap()
      expect((resolvedTools.search.definition as any).description).toBe('')
    })
  })

  describe('with wildcard (*) to include all tools', () => {
    it('resolves all tools from integration', async () => {
      const mockTools: McpTool[] = [
        {
          name: 'search',
          displayName: 'Search Tool',
          description: 'Searches for stuff',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            additionalProperties: false,
          },
        },
        {
          name: 'create',
          displayName: 'Create Tool',
          description: 'Creates stuff',
          inputSchema: {
            type: 'object',
            properties: { data: { type: 'string' } },
            additionalProperties: false,
          },
        },
        {
          name: 'delete',
          displayName: 'Delete Tool',
          description: 'Deletes stuff',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            additionalProperties: false,
          },
        },
      ]

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok(mockTools))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/*'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const resolvedTools = result.unwrap()
      expect(Object.keys(resolvedTools).sort()).toEqual([
        'create',
        'delete',
        'search',
      ])
      expect((resolvedTools.search.sourceData as any).toolLabel).toBe(
        'Search Tool',
      )
      expect((resolvedTools.create.sourceData as any).toolLabel).toBe(
        'Create Tool',
      )
      expect((resolvedTools.delete.sourceData as any).toolLabel).toBe(
        'Delete Tool',
      )
    })

    it('handles empty tools list with wildcard', async () => {
      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok([]))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/*'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const resolvedTools = result.unwrap()
      expect(Object.keys(resolvedTools)).toEqual([])
    })
  })

  describe('with multiple tools from same integration', () => {
    it('reuses integration data for multiple tools', async () => {
      const mockTools: McpTool[] = [
        {
          name: 'search',
          displayName: 'Search Tool',
          description: 'Searches',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: 'create',
          displayName: 'Create Tool',
          description: 'Creates',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      ]

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok(mockTools))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/search', 'test-integration/create'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      expect(listToolsSpy).toHaveBeenCalledTimes(1)
      const resolvedTools = result.unwrap()
      expect(Object.keys(resolvedTools).sort()).toEqual(['create', 'search'])
    })

    it('handles mix of specific tools and wildcard', async () => {
      const mockTools: McpTool[] = [
        {
          name: 'search',
          displayName: 'Search Tool',
          description: 'Searches',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: 'create',
          displayName: 'Create Tool',
          description: 'Creates',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      ]

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok(mockTools))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/search', 'test-integration/*'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const resolvedTools = result.unwrap()
      expect(Object.keys(resolvedTools).sort()).toEqual(['create', 'search'])
    })
  })

  describe('with multiple integrations', () => {
    let secondIntegration: IntegrationDto

    beforeEach(async () => {
      secondIntegration = await factories.createIntegration({
        workspace,
        name: 'second-integration',
        type: IntegrationType.ExternalMCP,
        configuration: {
          url: 'https://second.mcp/sse',
        },
      })
    })

    it('resolves tools from multiple integrations', async () => {
      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy
        .mockResolvedValueOnce(
          Result.ok([
            {
              name: 'search',
              displayName: 'Search Tool',
              description: 'First search',
              inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
              },
            } as McpTool,
          ]),
        )
        .mockResolvedValueOnce(
          Result.ok([
            {
              name: 'analyze',
              displayName: 'Analyze Tool',
              description: 'Second analyze',
              inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
              },
            } as McpTool,
          ]),
        )

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/search', 'second-integration/analyze'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      expect(listToolsSpy).toHaveBeenCalledTimes(2)
      const resolvedTools = result.unwrap()
      expect(Object.keys(resolvedTools).sort()).toEqual(['analyze', 'search'])
      expect((resolvedTools.search.sourceData as any).integrationId).toBe(
        integration.id,
      )
      expect((resolvedTools.analyze.sourceData as any).integrationId).toBe(
        secondIntegration.id,
      )
    })
  })

  describe('with Pipedream integration', () => {
    let pipedreamIntegration: IntegrationDto

    beforeEach(async () => {
      pipedreamIntegration = await factories.createIntegration({
        workspace,
        name: 'pipedream-integration',
        type: IntegrationType.Pipedream,
        configuration: {
          appName: 'slack',
          metadata: {
            displayName: 'Slack',
            imageUrl: 'https://example.com/slack-icon.png',
          },
        },
      })
    })

    it('includes imageUrl from Pipedream configuration', async () => {
      const mockTool: McpTool = {
        name: 'send-message',
        displayName: 'Send Message',
        description: 'Sends a message',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      }

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok([mockTool]))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['pipedream-integration/send-message'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const resolvedTools = result.unwrap()
      expect(resolvedTools['send-message'].sourceData as any).toEqual({
        source: ToolSource.Integration,
        integrationId: pipedreamIntegration.id,
        toolLabel: 'Send Message',
        imageUrl: 'https://example.com/slack-icon.png',
      })
    })

    it('handles missing imageUrl in Pipedream configuration', async () => {
      await factories.createIntegration({
        workspace,
        name: 'pipedream-no-image',
        type: IntegrationType.Pipedream,
        configuration: {
          appName: 'github',
          metadata: {
            displayName: 'GitHub',
          },
        },
      })

      const mockTool: McpTool = {
        name: 'create-issue',
        displayName: 'Create Issue',
        description: 'Creates an issue',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      }

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok([mockTool]))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['pipedream-no-image/create-issue'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const resolvedTools = result.unwrap()
      expect(
        (resolvedTools['create-issue'].sourceData as any).imageUrl,
      ).toBeUndefined()
    })
  })

  describe('tool handler execution', () => {
    beforeEach(() => {
      // Mock $completion since tool handler needs it for telemetry
      streamManager.$completion = {
        context: streamManager.$context,
        end: vi.fn(),
      } as any
    })

    it('creates executable tool handlers', async () => {
      const mockTool: McpTool = {
        name: 'search',
        displayName: 'Search Tool',
        description: 'Searches',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          additionalProperties: false,
        },
      }

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok([mockTool]))

      const callToolSpy = vi.spyOn(
        callIntegrationToolModule,
        'callIntegrationTool',
      )
      callToolSpy.mockResolvedValue(Result.ok({ result: 'success' }))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/search'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const resolvedTools = result.unwrap()
      expect((resolvedTools.search.definition as any).execute).toBeDefined()
      expect(typeof (resolvedTools.search.definition as any).execute).toBe(
        'function',
      )
    })

    it('handles tool execution success', async () => {
      const mockTool: McpTool = {
        name: 'search',
        displayName: 'Search Tool',
        description: 'Searches',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          additionalProperties: false,
        },
      }

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok([mockTool]))

      const callToolSpy = vi.spyOn(
        callIntegrationToolModule,
        'callIntegrationTool',
      )
      callToolSpy.mockResolvedValue(Result.ok({ result: 'search results' }))

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/search'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const resolvedTools = result.unwrap()

      const toolResult = await (resolvedTools.search.definition as any).execute(
        { query: 'test' },
        { toolCallId: 'call-123' },
      )

      expect(toolResult).toEqual({
        value: { result: 'search results' },
        isError: false,
      })
    })

    it('handles tool execution error', async () => {
      const mockTool: McpTool = {
        name: 'search',
        displayName: 'Search Tool',
        description: 'Searches',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          additionalProperties: false,
        },
      }

      const listToolsSpy = vi.spyOn(listToolsModule, 'listTools')
      listToolsSpy.mockResolvedValue(Result.ok([mockTool]))

      const callToolSpy = vi.spyOn(
        callIntegrationToolModule,
        'callIntegrationTool',
      )
      callToolSpy.mockResolvedValue(
        Result.error(new LatitudeError('Tool execution failed')),
      )

      const config: LatitudePromptConfig = {
        provider: 'test',
        model: 'test',
        tools: ['test-integration/search'],
      }
      const result = await resolveIntegrationTools({
        config,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const resolvedTools = result.unwrap()

      const toolResult = await (resolvedTools.search.definition as any).execute(
        { query: 'test' },
        { toolCallId: 'call-123' },
      )

      expect(toolResult).toEqual({
        value: 'Tool execution failed',
        isError: true,
      })
    })
  })
})
