import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveClientToolDefinition } from './clientTools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { ToolManifest } from '@latitude-data/constants/tools'
import { StreamManager } from '../../../../lib/streamManager'
import { LogSources } from '@latitude-data/constants'
import { createWorkspace } from '../../../../tests/factories/workspaces'
import { Workspace } from '../../../../schema/models/types/Workspace'
import { jsonSchema } from 'ai'

describe('resolveClientToolDefinition', () => {
  let workspace: Workspace
  let toolManifest: ToolManifest<ToolSource.Client>

  beforeEach(async () => {
    const setup = await createWorkspace()
    workspace = setup.workspace

    toolManifest = {
      definition: {
        description: 'A test tool',
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        }),
      },
      sourceData: {
        source: ToolSource.Client,
      },
    }
  })

  describe('with Playground source', () => {
    it('resolves tool with awaitClientToolResult handler', () => {
      const streamManager = {
        source: LogSources.Playground,
        workspace,
        $completion: {
          context: {},
        },
        tools: {},
      } as unknown as StreamManager

      const result = resolveClientToolDefinition({
        toolName: 'testTool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.description).toBe('A test tool')
      expect(tool.inputSchema).toBeDefined()
      expect(tool.execute).toBeDefined()
      expect(typeof tool.execute).toBe('function')
    })

    it('includes correct tool definition fields', () => {
      const streamManager = {
        source: LogSources.Playground,
        workspace,
        $completion: {
          context: {},
        },
        tools: {},
      } as unknown as StreamManager

      const result = resolveClientToolDefinition({
        toolName: 'searchTool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool).toMatchObject({
        description: 'A test tool',
        inputSchema: expect.any(Object),
        execute: expect.any(Function),
      })
    })
  })

  describe('with API source and custom handler', () => {
    it('resolves tool with custom handler from streamManager', () => {
      const mockHandler = vi.fn().mockResolvedValue({ result: 'success' })

      const streamManager = {
        source: LogSources.API,
        workspace,
        $completion: {
          context: {},
        },
        tools: {
          testTool: mockHandler,
        },
      } as unknown as StreamManager

      const result = resolveClientToolDefinition({
        toolName: 'testTool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.execute).toBeDefined()
    })

    it('returns error when handler not found in streamManager', () => {
      const streamManager = {
        source: LogSources.API,
        workspace,
        $completion: {
          context: {},
        },
        tools: {},
      } as unknown as StreamManager

      const result = resolveClientToolDefinition({
        toolName: 'missingTool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        "Tool handler not found for client tool 'missingTool'",
      )
    })

    it('uses handler for matching tool name', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      const streamManager = {
        source: LogSources.API,
        workspace,
        $completion: {
          context: {},
        },
        tools: {
          tool1: handler1,
          tool2: handler2,
        },
      } as unknown as StreamManager

      const result = resolveClientToolDefinition({
        toolName: 'tool1',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })
  })

  describe('with Evaluation source', () => {
    it('resolves tool when handler exists', () => {
      const mockHandler = vi.fn().mockResolvedValue({ result: 'eval result' })

      const streamManager = {
        source: LogSources.Evaluation,
        workspace,
        $completion: {
          context: {},
        },
        tools: {
          evalTool: mockHandler,
        },
      } as unknown as StreamManager

      const result = resolveClientToolDefinition({
        toolName: 'evalTool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      expect(result.value!.execute).toBeDefined()
    })

    it('returns error when handler not found', () => {
      const streamManager = {
        source: LogSources.Evaluation,
        workspace,
        $completion: {
          context: {},
        },
        tools: {},
      } as unknown as StreamManager

      const result = resolveClientToolDefinition({
        toolName: 'missingTool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
    })
  })

  describe('tool definition structure', () => {
    it('preserves all definition fields from manifest', () => {
      const complexManifest: ToolManifest<ToolSource.Client> = {
        definition: {
          description: 'Complex tool with multiple params',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Result limit' },
              filters: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                },
              },
            },
            required: ['query'],
          }),
        },
        sourceData: {
          source: ToolSource.Client,
        },
      }

      const streamManager = {
        source: LogSources.Playground,
        workspace,
        $completion: {
          context: {},
        },
        tools: {},
      } as unknown as StreamManager

      const result = resolveClientToolDefinition({
        toolName: 'complexTool',
        toolManifest: complexManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.description).toBe('Complex tool with multiple params')
      expect(tool.inputSchema).toBeDefined()
    })

    it('adds execute function to definition', () => {
      const streamManager = {
        source: LogSources.Playground,
        workspace,
        $completion: {
          context: {},
        },
        tools: {},
      } as unknown as StreamManager

      const result = resolveClientToolDefinition({
        toolName: 'testTool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      // Should have definition fields plus execute
      expect(tool).toHaveProperty('description')
      expect(tool).toHaveProperty('inputSchema')
      expect(tool).toHaveProperty('execute')
    })
  })

  describe('edge cases', () => {
    it('handles tool with no required parameters', () => {
      const simpleManifest: ToolManifest<ToolSource.Client> = {
        definition: {
          description: 'Simple tool',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {},
          }),
        },
        sourceData: {
          source: ToolSource.Client,
        },
      }

      const streamManager = {
        source: LogSources.Playground,
        workspace,
        $completion: {
          context: {},
        },
        tools: {},
      } as unknown as StreamManager

      const result = resolveClientToolDefinition({
        toolName: 'simpleTool',
        toolManifest: simpleManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })

    it('handles different log sources correctly', () => {
      const sources = [
        LogSources.Playground,
        LogSources.API,
        LogSources.Evaluation,
      ]

      for (const source of sources) {
        const streamManager = {
          source,
          workspace,
          $completion: {
            context: {},
          },
          tools:
            source === LogSources.Playground
              ? {}
              : { testTool: vi.fn().mockResolvedValue({}) },
        } as unknown as StreamManager

        const result = resolveClientToolDefinition({
          toolName: 'testTool',
          toolManifest,
          streamManager,
        })

        expect(result.ok).toBe(true)
      }
    })

    it('returns error for undefined handler in non-playground context', () => {
      const streamManager = {
        source: LogSources.API,
        workspace,
        $completion: {
          context: {},
        },
        tools: {
          otherTool: vi.fn(),
        },
      } as unknown as StreamManager

      const result = resolveClientToolDefinition({
        toolName: 'testTool',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})
