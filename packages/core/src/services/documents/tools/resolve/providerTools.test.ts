import { describe, it, expect, beforeEach } from 'vitest'
import { resolveProviderToolDefinition } from './providerTools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { ToolManifest } from '@latitude-data/constants/tools'
import { StreamManager } from '../../../../lib/streamManager'
import { createWorkspace } from '../../../../tests/factories/workspaces'
import { Workspace } from '../../../../schema/models/types/Workspace'
import { Providers } from '@latitude-data/constants'
import { jsonSchema } from 'ai'

describe('resolveProviderToolDefinition', () => {
  let workspace: Workspace

  beforeEach(async () => {
    const setup = await createWorkspace()
    workspace = setup.workspace
  })

  describe('OpenAI web_search tool', () => {
    it('resolves web_search tool successfully', async () => {
      const toolManifest: ToolManifest<ToolSource.ProviderTool> = {
        definition: {
          description: 'OpenAI web search',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.ProviderTool,
          provider: Providers.OpenAI,
          tool: {
            type: 'web_search',
            search_context_size: 'medium',
          },
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveProviderToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.inputSchema).toBeDefined()
    })

    it('resolves web_search with user_location', async () => {
      const toolManifest: ToolManifest<ToolSource.ProviderTool> = {
        definition: {
          description: 'OpenAI web search with location',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.ProviderTool,
          provider: Providers.OpenAI,
          tool: {
            type: 'web_search',
            search_context_size: 'medium',
            user_location: {
              type: 'approximate',
              city: 'New York',
              country: 'US',
            },
          },
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveProviderToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool).toBeDefined()
    })

    it('resolves web_search with custom search_context_size', async () => {
      const toolManifest: ToolManifest<ToolSource.ProviderTool> = {
        definition: {
          description: 'OpenAI web search',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.ProviderTool,
          provider: Providers.OpenAI,
          tool: {
            type: 'web_search',
            search_context_size: 'medium',
          },
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveProviderToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })
  })

  describe('unsupported tools', () => {
    it('returns error for file_search tool', async () => {
      const toolManifest: ToolManifest<ToolSource.ProviderTool> = {
        definition: {
          description: 'File search',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.ProviderTool,
          provider: Providers.OpenAI,
          tool: {
            type: 'file_search',
          } as any,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveProviderToolDefinition({
        toolName: 'file_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        'file search tool is not supported',
      )
    })

    it('returns error for computer_use_preview tool', async () => {
      const toolManifest: ToolManifest<ToolSource.ProviderTool> = {
        definition: {
          description: 'Computer use',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.ProviderTool,
          provider: Providers.OpenAI,
          tool: {
            type: 'computer_use_preview',
          } as any,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveProviderToolDefinition({
        toolName: 'computer_use',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        'computer use tool is not supported',
      )
    })
  })

  describe('unsupported providers', () => {
    it('returns error for non-OpenAI provider', async () => {
      const toolManifest: ToolManifest<ToolSource.ProviderTool> = {
        definition: {
          description: 'Tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.ProviderTool,
          provider: 'anthropic' as Providers,
          tool: {
            type: 'web_search',
            search_context_size: 'medium',
          },
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveProviderToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        "Provider tools for 'anthropic' not supported",
      )
    })

    it('returns error when provider is undefined', async () => {
      const toolManifest: ToolManifest<ToolSource.ProviderTool> = {
        definition: {
          description: 'Tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.ProviderTool,
          provider: undefined as any,
          tool: {
            type: 'web_search',
            search_context_size: 'medium',
          },
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveProviderToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
    })
  })

  describe('tool definition structure', () => {
    it('returns complete tool definition', async () => {
      const toolManifest: ToolManifest<ToolSource.ProviderTool> = {
        definition: {
          description: 'OpenAI web search',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.ProviderTool,
          provider: Providers.OpenAI,
          tool: {
            type: 'web_search',
            search_context_size: 'medium',
          },
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveProviderToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool).toHaveProperty('inputSchema')
      expect(tool).toHaveProperty('execute')
    })

    it('includes all schema properties', async () => {
      const toolManifest: ToolManifest<ToolSource.ProviderTool> = {
        definition: {
          description: 'Web search with all properties',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.ProviderTool,
          provider: Providers.OpenAI,
          tool: {
            type: 'web_search',
            search_context_size: 'medium',
          },
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveProviderToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.inputSchema).toBeDefined()
    })
  })

  describe('missing tool data', () => {
    it('returns error when tool is undefined', async () => {
      const toolManifest: ToolManifest<ToolSource.ProviderTool> = {
        definition: {
          description: 'Tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.ProviderTool,
          provider: Providers.OpenAI,
          tool: undefined as any,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = await resolveProviderToolDefinition({
        toolName: 'undefined_tool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain('OpenAI Tool not found')
    })
  })
})
