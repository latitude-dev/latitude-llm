import { describe, it, expect, beforeEach } from 'vitest'
import { resolveLatitudeToolDefinition } from './latitudeTools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { ToolManifest } from '@latitude-data/constants/tools'
import { StreamManager } from '../../../../lib/streamManager'
import { createWorkspace } from '../../../../tests/factories/workspaces'
import { Workspace } from '../../../../schema/models/types/Workspace'
import { LatitudeTool } from '@latitude-data/constants'
import { jsonSchema } from 'ai'

describe('resolveLatitudeToolDefinition', () => {
  let workspace: Workspace

  beforeEach(async () => {
    const setup = await createWorkspace()
    workspace = setup.workspace
  })

  describe('resolving latitude tools', () => {
    it('resolves web-search tool', () => {
      const toolManifest: ToolManifest<ToolSource.Latitude> = {
        definition: {
          description: 'Web search tool',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.Latitude,
          latitudeTool: LatitudeTool.WebSearch,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = resolveLatitudeToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.description).toBe('Web search tool')
      expect(tool.inputSchema).toBeDefined()
      expect(tool.execute).toBeDefined()
      expect(typeof tool.execute).toBe('function')
    })

    it('resolves run-code tool', () => {
      const toolManifest: ToolManifest<ToolSource.Latitude> = {
        definition: {
          description: 'Run code tool',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              code: { type: 'string' },
              language: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.Latitude,
          latitudeTool: LatitudeTool.RunCode,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = resolveLatitudeToolDefinition({
        toolName: 'run_code',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      expect(result.value!.execute).toBeDefined()
    })

    it('returns error when latitude tool not found', () => {
      const toolManifest: ToolManifest<ToolSource.Latitude> = {
        definition: {
          description: 'Non-existent tool',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Latitude,
          latitudeTool: 'non-existent-tool' as LatitudeTool,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = resolveLatitudeToolDefinition({
        toolName: 'non_existent',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        "There is no Latitude tool with the name 'non-existent-tool'",
      )
    })
  })

  describe('tool definition structure', () => {
    it('preserves manifest definition fields', () => {
      const toolManifest: ToolManifest<ToolSource.Latitude> = {
        definition: {
          description: 'Test latitude tool',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
          }),
          outputSchema: jsonSchema({
            type: 'object',
            properties: {
              output: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.Latitude,
          latitudeTool: LatitudeTool.WebSearch,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = resolveLatitudeToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.description).toBe('Test latitude tool')
      expect(tool.inputSchema).toBeDefined()
    })

    it('wraps execute function with telemetry', () => {
      const toolManifest: ToolManifest<ToolSource.Latitude> = {
        definition: {
          description: 'Web search',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.Latitude,
          latitudeTool: LatitudeTool.WebSearch,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = resolveLatitudeToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.execute).toBeDefined()
      expect(typeof tool.execute).toBe('function')
    })
  })

  describe('execute function', () => {
    it('returns execute function that calls underlying tool execute', async () => {
      const toolManifest: ToolManifest<ToolSource.Latitude> = {
        definition: {
          description: 'Web search',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.Latitude,
          latitudeTool: LatitudeTool.WebSearch,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = resolveLatitudeToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.execute).toBeDefined()
    })
  })

  describe('telemetry context', () => {
    it('uses context from streamManager completion', () => {
      const mockContext = { traceId: 'test-trace-id' }

      const toolManifest: ToolManifest<ToolSource.Latitude> = {
        definition: {
          description: 'Web search',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.Latitude,
          latitudeTool: LatitudeTool.WebSearch,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: mockContext,
        },
      } as unknown as StreamManager

      const result = resolveLatitudeToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('handles all latitude tool types', () => {
      const latitudeTools = Object.values(LatitudeTool)

      for (const latitudeTool of latitudeTools) {
        const toolManifest: ToolManifest<ToolSource.Latitude> = {
          definition: {
            description: `${latitudeTool} tool`,
            inputSchema: jsonSchema({
              type: 'object',
              properties: {},
            }),
          },
          sourceData: {
            source: ToolSource.Latitude,
            latitudeTool,
          },
        }

        const streamManager = {
          workspace,
          $completion: {
            context: {},
          },
        } as unknown as StreamManager

        const result = resolveLatitudeToolDefinition({
          toolName: latitudeTool.replace(/-/g, '_'),
          toolManifest,
          streamManager,
        })

        expect(result.ok).toBe(true)
      }
    })

    it('handles tool with no outputSchema', () => {
      const toolManifest: ToolManifest<ToolSource.Latitude> = {
        definition: {
          description: 'Tool without output schema',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.Latitude,
          latitudeTool: LatitudeTool.WebSearch,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = resolveLatitudeToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })

    it('handles empty context object', () => {
      const toolManifest: ToolManifest<ToolSource.Latitude> = {
        definition: {
          description: 'Web search',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {},
          }),
        },
        sourceData: {
          source: ToolSource.Latitude,
          latitudeTool: LatitudeTool.WebSearch,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
      } as unknown as StreamManager

      const result = resolveLatitudeToolDefinition({
        toolName: 'web_search',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })
  })
})
