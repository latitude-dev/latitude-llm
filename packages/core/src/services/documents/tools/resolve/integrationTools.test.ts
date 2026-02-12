import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveIntegrationToolDefinition } from './integrationTools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { ToolManifest } from '@latitude-data/constants/tools'
import { StreamManager } from '../../../../lib/streamManager'
import { createWorkspace } from '../../../../tests/factories/workspaces'
import { Workspace } from '../../../../schema/models/types/Workspace'
import { IntegrationType } from '@latitude-data/constants'
import { jsonSchema } from 'ai'
import * as integrationsModule from '../../../../repositories/integrationsRepository'
import * as callToolModule from '../../../../services/integrations/McpClient/callTool'
import * as telemetryModule from '../../../../telemetry'
import { Result } from '../../../../lib/Result'

describe('resolveIntegrationToolDefinition', () => {
  let workspace: Workspace

  beforeEach(async () => {
    const setup = await createWorkspace()
    workspace = setup.workspace
  })

  describe('resolving integration tools', () => {
    it('calls MCP with short tool name when toolName is composite (integration/tool)', async () => {
      const mockIntegration = {
        id: 1,
        name: 'my-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        () =>
          ({
            find: vi.fn().mockResolvedValue(Result.ok(mockIntegration)),
          }) as any,
      )

      const callIntegrationToolMock = vi
        .spyOn(callToolModule, 'callIntegrationTool')
        .mockResolvedValue(Result.ok('result') as any)

      vi.spyOn(telemetryModule.telemetry.span, 'tool').mockReturnValue({
        end: vi.fn(),
      } as any)

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'Tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 1,
          toolLabel: 'My Tool',
        },
      }

      const streamManager = {
        workspace,
        $context: {},
        $completion: { context: {} },
      } as unknown as StreamManager

      const result = await resolveIntegrationToolDefinition({
        toolName: 'my-integration/my_tool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      await tool.execute!({}, { toolCallId: 'call-1' } as any)

      expect(callIntegrationToolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'my_tool',
          integration: mockIntegration,
        }),
      )
    })

    it('resolves integration tool with execute function', async () => {
      const mockIntegration = {
        id: 1,
        name: 'test-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        () =>
          ({
            find: vi.fn().mockResolvedValue(Result.ok(mockIntegration)),
          }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'Test integration tool',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 1,
          toolLabel: 'Test Tool',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveIntegrationToolDefinition({
        toolName: 'test_tool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.description).toBe('Test integration tool')
      expect(tool.inputSchema).toBeDefined()
      expect(tool.execute).toBeDefined()
      expect(typeof tool.execute).toBe('function')
    })

    it('returns error when integration not found', async () => {
      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        () =>
          ({
            find: vi
              .fn()
              .mockResolvedValue(Result.error(new Error('Not found'))),
          }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'Tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 999,
          toolLabel: 'Missing Tool',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveIntegrationToolDefinition({
        toolName: 'missing_tool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
    })
  })

  describe('tool definition structure', () => {
    it('preserves manifest definition fields', async () => {
      const mockIntegration = {
        id: 1,
        name: 'complex-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        () =>
          ({
            find: vi.fn().mockResolvedValue(Result.ok(mockIntegration)),
          }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'Complex integration tool',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              filters: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  limit: { type: 'number' },
                },
              },
            },
            required: ['query'],
          }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 1,
          toolLabel: 'Complex Tool',
          imageUrl: 'https://example.com/icon.png',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveIntegrationToolDefinition({
        toolName: 'complex_tool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.description).toBe('Complex integration tool')
      expect(tool.inputSchema).toBeDefined()
    })

    it('includes imageUrl from sourceData', async () => {
      const mockIntegration = {
        id: 1,
        name: 'integration-with-icon',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        () =>
          ({
            find: vi.fn().mockResolvedValue(Result.ok(mockIntegration)),
          }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'Tool with image',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 1,
          toolLabel: 'Image Tool',
          imageUrl: 'https://example.com/logo.png',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveIntegrationToolDefinition({
        toolName: 'image_tool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })
  })

  describe('integration types', () => {
    it('handles Pipedream integration', async () => {
      const mockIntegration = {
        id: 1,
        name: 'pipedream-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        () =>
          ({
            find: vi.fn().mockResolvedValue(Result.ok(mockIntegration)),
          }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'Pipedream tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 1,
          toolLabel: 'Pipedream Tool',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveIntegrationToolDefinition({
        toolName: 'pipedream_tool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })
  })

  describe('workspace context', () => {
    it('uses correct workspace from streamManager', async () => {
      const findMock = vi.fn().mockResolvedValue(
        Result.ok({
          id: 1,
          name: 'test-integration',
          type: IntegrationType.Pipedream,
          workspaceId: workspace.id,
        }),
      )

      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        (workspaceId: number) => {
          expect(workspaceId).toBe(workspace.id)
          return {
            find: findMock,
          } as any
        },
      )

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'Tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 1,
          toolLabel: 'Tool',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      await resolveIntegrationToolDefinition({
        toolName: 'tool',
        toolManifest,
        streamManager,
      })

      expect(findMock).toHaveBeenCalledWith(1)
    })

    it('uses correct integrationId from manifest', async () => {
      const findMock = vi.fn().mockResolvedValue(
        Result.ok({
          id: 123,
          name: 'specific-integration',
          type: IntegrationType.Pipedream,
          workspaceId: workspace.id,
        }),
      )

      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        () =>
          ({
            find: findMock,
          }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'Tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 123,
          toolLabel: 'Tool',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      await resolveIntegrationToolDefinition({
        toolName: 'tool',
        toolManifest,
        streamManager,
      })

      expect(findMock).toHaveBeenCalledWith(123)
    })
  })

  describe('edge cases', () => {
    it('handles tool with no parameters', async () => {
      const mockIntegration = {
        id: 1,
        name: 'no-params-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        () =>
          ({
            find: vi.fn().mockResolvedValue(Result.ok(mockIntegration)),
          }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'No params tool',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {},
          }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 1,
          toolLabel: 'No Params',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveIntegrationToolDefinition({
        toolName: 'no_params',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })

    it('handles empty toolLabel', async () => {
      const mockIntegration = {
        id: 1,
        name: 'integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        () =>
          ({
            find: vi.fn().mockResolvedValue(Result.ok(mockIntegration)),
          }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'Tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 1,
          toolLabel: '',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveIntegrationToolDefinition({
        toolName: 'tool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })

    it('handles integration repository errors', async () => {
      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        () =>
          ({
            find: vi
              .fn()
              .mockResolvedValue(
                Result.error(new Error('Database connection failed')),
              ),
          }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'Tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 1,
          toolLabel: 'Tool',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveIntegrationToolDefinition({
        toolName: 'tool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
    })
  })

  describe('telemetry context', () => {
    it('uses context from streamManager completion', async () => {
      const mockContext = { traceId: 'test-trace-id' }

      const mockIntegration = {
        id: 1,
        name: 'integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      vi.spyOn(integrationsModule, 'IntegrationsRepository').mockImplementation(
        () =>
          ({
            find: vi.fn().mockResolvedValue(Result.ok(mockIntegration)),
          }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Integration> = {
        definition: {
          description: 'Tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 1,
          toolLabel: 'Tool',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: mockContext,
        },
      } as unknown as StreamManager

      const result = await resolveIntegrationToolDefinition({
        toolName: 'tool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })
  })
})
