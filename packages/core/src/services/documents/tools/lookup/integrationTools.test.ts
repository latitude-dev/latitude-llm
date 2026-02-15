import { describe, it, expect, beforeEach, vi } from 'vitest'
import { lookupIntegrationTools } from './integrationTools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { IntegrationType } from '@latitude-data/constants'
import { createWorkspace } from '../../../../tests/factories/workspaces'
import { Workspace } from '../../../../schema/models/types/Workspace'
import * as findIntegrationByNameModule from '../../../../queries/integrations/findByName'
import * as listToolsModule from '../../../../services/integrations'
import { Result } from '../../../../lib/Result'

describe('lookupIntegrationTools', () => {
  let workspace: Workspace

  beforeEach(async () => {
    const setup = await createWorkspace()
    workspace = setup.workspace
  })

  describe('when no tools are provided', () => {
    it('returns empty object', async () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: undefined,
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })
  })

  describe('with old schema (object format)', () => {
    it('returns empty object (no integration tools in old schema)', async () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: {
          myTool: {
            description: 'Custom tool',
            parameters: {},
          },
        } as any,
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })
  })

  describe('with new schema (array format)', () => {
    it('returns empty object when no integration tools specified', async () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: [
          'latitude/web-search',
          {
            myTool: {
              description: 'Custom tool',
              parameters: {},
            },
          } as any,
        ],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })

    it('looks up single integration tool', async () => {
      const mockIntegration = {
        id: 1,
        name: 'my-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
        configuration: {
          metadata: {
            imageUrl: 'https://example.com/image.png',
          },
        },
      }

      const mockToolDefinitions = [
        {
          name: 'search',
          displayName: 'Search Tool',
          description: 'A search tool',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      ]

      vi.spyOn(findIntegrationByNameModule, 'findIntegrationByName').mockResolvedValue(mockIntegration as any)

      vi.spyOn(listToolsModule, 'listTools').mockResolvedValue(
        Result.ok(mockToolDefinitions) as any,
      )

      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['my-integration/search'],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(true)
      expect(result.value!['my-integration_search']).toBeDefined()
      expect(result.value!['my-integration_search']!.sourceData.source).toBe(
        ToolSource.Integration,
      )
      expect(
        result.value!['my-integration_search']!.sourceData.integrationId,
      ).toBe(1)
      expect(result.value!['my-integration_search']!.sourceData.toolLabel).toBe(
        'Search Tool',
      )
      expect(result.value!['my-integration_search']!.sourceData.imageUrl).toBe(
        'https://example.com/image.png',
      )
    })

    it('looks up all tools from integration with wildcard', async () => {
      const mockIntegration = {
        id: 1,
        name: 'my-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      const mockToolDefinitions = [
        {
          name: 'search',
          displayName: 'Search Tool',
          description: 'A search tool',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'fetch',
          displayName: 'Fetch Tool',
          description: 'A fetch tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ]

      vi.spyOn(findIntegrationByNameModule, 'findIntegrationByName').mockResolvedValue(mockIntegration as any)

      vi.spyOn(listToolsModule, 'listTools').mockResolvedValue(
        Result.ok(mockToolDefinitions) as any,
      )

      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['my-integration/*'],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(true)
      expect(Object.keys(result.value!).length).toBe(2)
      expect(result.value!['my-integration_search']).toBeDefined()
      expect(result.value!['my-integration_fetch']).toBeDefined()
    })

    it('looks up multiple tools from same integration', async () => {
      const mockIntegration = {
        id: 1,
        name: 'my-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      const mockToolDefinitions = [
        {
          name: 'search',
          displayName: 'Search Tool',
          description: 'A search tool',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'fetch',
          displayName: 'Fetch Tool',
          description: 'A fetch tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ]

      vi.spyOn(findIntegrationByNameModule, 'findIntegrationByName').mockResolvedValue(mockIntegration as any)

      vi.spyOn(listToolsModule, 'listTools').mockResolvedValue(
        Result.ok(mockToolDefinitions) as any,
      )

      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['my-integration/search', 'my-integration/fetch'],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(true)
      expect(Object.keys(result.value!).length).toBe(2)
      expect(result.value!['my-integration_search']).toBeDefined()
      expect(result.value!['my-integration_fetch']).toBeDefined()
    })

    it('looks up two integrations with same tool name under unique keys', async () => {
      const mockIntegration1 = {
        id: 1,
        name: 'gmail_personal',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      const mockIntegration2 = {
        id: 2,
        name: 'gmail_work',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      const mockToolDefinitions = [
        {
          name: 'create_draft',
          displayName: 'Create Draft',
          description: 'Create email draft',
          inputSchema: { type: 'object', properties: {} },
        },
      ]

      vi.spyOn(findIntegrationByNameModule, 'findIntegrationByName').mockImplementation(({ name }: any) => {
        if (name === 'gmail_personal') {
          return Promise.resolve(mockIntegration1 as any)
        }
        return Promise.resolve(mockIntegration2 as any)
      })

      vi.spyOn(listToolsModule, 'listTools').mockResolvedValue(
        Result.ok(mockToolDefinitions) as any,
      )

      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['gmail_personal/create_draft', 'gmail_work/create_draft'],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(true)
      expect(Object.keys(result.value!).sort()).toEqual([
        'gmail_personal_create_draft',
        'gmail_work_create_draft',
      ])
      expect(
        result.value!['gmail_personal_create_draft']!.sourceData.integrationId,
      ).toBe(1)
      expect(
        result.value!['gmail_work_create_draft']!.sourceData.integrationId,
      ).toBe(2)
    })

    it('looks up tools from multiple integrations', async () => {
      const mockIntegration1 = {
        id: 1,
        name: 'integration1',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      const mockIntegration2 = {
        id: 2,
        name: 'integration2',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      const mockToolDefinitions1 = [
        {
          name: 'tool1',
          displayName: 'Tool 1',
          description: 'Tool 1',
          inputSchema: { type: 'object', properties: {} },
        },
      ]

      const mockToolDefinitions2 = [
        {
          name: 'tool2',
          displayName: 'Tool 2',
          description: 'Tool 2',
          inputSchema: { type: 'object', properties: {} },
        },
      ]

      vi.spyOn(findIntegrationByNameModule, 'findIntegrationByName').mockImplementation(({ name }: any) => {
        if (name === 'integration1') {
          return Promise.resolve(mockIntegration1 as any)
        }
        return Promise.resolve(mockIntegration2 as any)
      })

      vi.spyOn(listToolsModule, 'listTools').mockImplementation(
        (integration: any) => {
          if (integration.id === 1) {
            return Promise.resolve(Result.ok(mockToolDefinitions1) as any)
          }
          return Promise.resolve(Result.ok(mockToolDefinitions2) as any)
        },
      )

      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['integration1/tool1', 'integration2/tool2'],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(true)
      expect(Object.keys(result.value!).length).toBe(2)
      expect(result.value!['integration1_tool1']).toBeDefined()
      expect(result.value!['integration2_tool2']).toBeDefined()
    })

    it('returns error when tool id is invalid (missing integration name)', async () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['/tool'],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain("Invalid tool: '/tool'")
    })

    it('returns error when tool id is invalid (missing tool name)', async () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['integration/'],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain("Invalid tool: 'integration/'")
    })

    it('returns error when integration not found', async () => {
      vi.spyOn(findIntegrationByNameModule, 'findIntegrationByName').mockRejectedValue(new Error('Not found'))

      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['non-existent/tool'],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(false)
    })

    it('returns error when tool not found in integration', async () => {
      const mockIntegration = {
        id: 1,
        name: 'my-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      const mockToolDefinitions = [
        {
          name: 'existing-tool',
          displayName: 'Existing Tool',
          description: 'An existing tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ]

      vi.spyOn(findIntegrationByNameModule, 'findIntegrationByName').mockResolvedValue(mockIntegration as any)

      vi.spyOn(listToolsModule, 'listTools').mockResolvedValue(
        Result.ok(mockToolDefinitions) as any,
      )

      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['my-integration/non-existent-tool'],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        "Tool 'non-existent-tool' not found in Integration 'my-integration'",
      )
    })

    it('filters out latitude tools from integration lookup', async () => {
      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['latitude/web-search', 'my-integration/tool'],
      }

      const mockIntegration = {
        id: 1,
        name: 'my-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      const mockToolDefinitions = [
        {
          name: 'tool',
          displayName: 'Tool',
          description: 'A tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ]

      vi.spyOn(findIntegrationByNameModule, 'findIntegrationByName').mockResolvedValue(mockIntegration as any)

      vi.spyOn(listToolsModule, 'listTools').mockResolvedValue(
        Result.ok(mockToolDefinitions) as any,
      )

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(true)
      expect(Object.keys(result.value!).length).toBe(1)
      expect(result.value!['my-integration_tool']).toBeDefined()
    })
  })

  describe('tool manifest structure', () => {
    it('creates correct manifest with all fields', async () => {
      const mockIntegration = {
        id: 123,
        name: 'test-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
        configuration: {
          metadata: {
            imageUrl: 'https://example.com/logo.png',
          },
        },
      }

      const mockToolDefinitions = [
        {
          name: 'testTool',
          displayName: 'Test Tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
          },
        },
      ]

      vi.spyOn(findIntegrationByNameModule, 'findIntegrationByName').mockResolvedValue(mockIntegration as any)

      vi.spyOn(listToolsModule, 'listTools').mockResolvedValue(
        Result.ok(mockToolDefinitions) as any,
      )

      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['test-integration/testTool'],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(true)
      const manifest = result.value!['test-integration_testTool']
      expect(manifest).toMatchObject({
        definition: {
          description: 'A test tool',
          inputSchema: expect.any(Object),
        },
        sourceData: {
          source: ToolSource.Integration,
          integrationId: 123,
          toolLabel: 'Test Tool',
          imageUrl: 'https://example.com/logo.png',
        },
      })
    })

    it('handles integration without imageUrl', async () => {
      const mockIntegration = {
        id: 1,
        name: 'my-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
        configuration: {},
      }

      const mockToolDefinitions = [
        {
          name: 'tool',
          displayName: 'Tool',
          description: 'A tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ]

      vi.spyOn(findIntegrationByNameModule, 'findIntegrationByName').mockResolvedValue(mockIntegration as any)

      vi.spyOn(listToolsModule, 'listTools').mockResolvedValue(
        Result.ok(mockToolDefinitions) as any,
      )

      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['my-integration/tool'],
      }

      const result = await lookupIntegrationTools({ config, workspace })

      expect(result.ok).toBe(true)
      const manifest = result.value!['my-integration_tool']
      expect(manifest!.sourceData.imageUrl).toBeUndefined()
    })

    it('caches integration looks up for multiple tools from same integration', async () => {
      const mockIntegration = {
        id: 1,
        name: 'my-integration',
        type: IntegrationType.Pipedream,
        workspaceId: workspace.id,
      }

      const mockToolDefinitions = [
        {
          name: 'tool1',
          displayName: 'Tool 1',
          description: 'Tool 1',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'tool2',
          displayName: 'Tool 2',
          description: 'Tool 2',
          inputSchema: { type: 'object', properties: {} },
        },
      ]

      const findByNameMock = vi
        .spyOn(findIntegrationByNameModule, 'findIntegrationByName')
        .mockResolvedValue(mockIntegration as any)

      vi.spyOn(listToolsModule, 'listTools').mockResolvedValue(
        Result.ok(mockToolDefinitions) as any,
      )

      const config: Pick<LatitudePromptConfig, 'tools'> = {
        tools: ['my-integration/tool1', 'my-integration/tool2'],
      }

      await lookupIntegrationTools({ config, workspace })

      // Should only call findByName once due to caching
      expect(findByNameMock).toHaveBeenCalledTimes(1)
    })
  })
})
