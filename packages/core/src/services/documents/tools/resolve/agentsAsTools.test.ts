import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { ToolManifest } from '@latitude-data/constants/tools'
import { StreamManager } from '../../../../lib/streamManager'
import { Workspace } from '../../../../schema/models/types/Workspace'
import { createProject } from '../../../../tests/factories/projects'
import { createDocumentVersion } from '../../../../tests/factories/documents'
import { createDraft } from '../../../../tests/factories/commits'
import { jsonSchema } from 'ai'
import { Commit } from '../../../../schema/models/types/Commit'
import { Result } from '../../../../lib/Result'
import { resolveAgentAsToolDefinition } from './agentsAsTools'
import { BACKGROUND } from '../../../../telemetry'
import * as commitsModule from '../../../commits'

vi.spyOn(commitsModule, 'runDocumentAtCommit')

describe('resolveAgentAsToolDefinition', () => {
  let workspace: Workspace
  let project: any
  let commit: Commit
  let user: any

  beforeEach(async () => {
    const setup = await createProject()
    workspace = setup.workspace
    project = setup.project
    user = setup.user

    const { commit: draftCommit } = await createDraft({ project, user })
    commit = draftCommit
  })

  describe('resolving agent tools', () => {
    it('resolves agent as tool with execute function', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/test-agent',
        content:
          '---\nname: Test Agent\ndescription: Test agent\n---\nAgent content',
      })

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Test agent tool',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
          }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/test-agent',
          documentUuid: agent.documentUuid,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
        promptSource: {
          commit,
        },
        tools: {},
        abortSignal: undefined,
        simulationSettings: undefined,
        source: 'test',
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'test_agent',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.description).toBe('Test agent tool')
      expect(tool.inputSchema).toBeDefined()
      expect(tool.execute).toBeDefined()
      expect(typeof tool.execute).toBe('function')
    })

    it('returns error when promptSource has no commit', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/test-agent',
        content: '---\nname: Test\n---\nContent',
      })

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Test agent',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/test-agent',
          documentUuid: agent.documentUuid,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
        promptSource: {}, // No commit
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'test_agent',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        'Sub agents are not supported in this context',
      )
    })

    it('returns error when document not found', async () => {
      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Non-existent agent',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/non-existent',
          documentUuid: 'non-existent-uuid',
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
        promptSource: {
          commit,
        },
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'non_existent',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain('Document not found')
    })
  })

  describe('tool definition structure', () => {
    it('preserves manifest definition fields', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/complex-agent',
        content: '---\nname: Complex\n---\nContent',
      })

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Complex agent with parameters',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Query input' },
              options: {
                type: 'object',
                properties: {
                  limit: { type: 'number' },
                },
              },
            },
            required: ['query'],
          }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/complex-agent',
          documentUuid: agent.documentUuid,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
        promptSource: {
          commit,
        },
        tools: {},
        abortSignal: undefined,
        simulationSettings: undefined,
        source: 'test',
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'complex_agent',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!
      expect(tool.description).toBe('Complex agent with parameters')
      expect(tool.inputSchema).toBeDefined()
      expect(tool.execute).toBeDefined()
    })
  })

  describe('streamManager context', () => {
    it('passes tools from streamManager to subagent', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/agent-with-tools',
        content: '---\nname: Agent\n---\nContent',
      })

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Agent with tools',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/agent-with-tools',
          documentUuid: agent.documentUuid,
        },
      }

      const mockTools = {
        customTool: vi.fn(),
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
        promptSource: {
          commit,
        },
        tools: mockTools,
        abortSignal: undefined,
        simulationSettings: undefined,
        source: 'test',
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'agent_with_tools',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })

    it('passes abortSignal from streamManager', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/abortable-agent',
        content: '---\nname: Abortable\n---\nContent',
      })

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Abortable agent',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/abortable-agent',
          documentUuid: agent.documentUuid,
        },
      }

      const abortController = new AbortController()

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
        promptSource: {
          commit,
        },
        tools: {},
        abortSignal: abortController.signal,
        simulationSettings: undefined,
        source: 'test',
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'abortable_agent',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })

    it('passes simulationSettings from streamManager', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/simulated-agent',
        content: '---\nname: Simulated\n---\nContent',
      })

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Simulated agent',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/simulated-agent',
          documentUuid: agent.documentUuid,
        },
      }

      const simulationSettings = {
        simulateToolResponses: true,
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
        promptSource: {
          commit,
        },
        tools: {},
        abortSignal: undefined,
        simulationSettings,
        source: 'test',
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'simulated_agent',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })

    it('passes source from streamManager to subagent', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/source-agent',
        content: '---\nname: Source\n---\nContent',
      })

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Source agent',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/source-agent',
          documentUuid: agent.documentUuid,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
        promptSource: {
          commit,
        },
        tools: {},
        abortSignal: undefined,
        simulationSettings: undefined,
        source: 'playground',
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'source_agent',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('handles agent with no parameters', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/no-params',
        content: '---\nname: No Params\n---\nContent',
      })

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Agent with no params',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {},
          }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/no-params',
          documentUuid: agent.documentUuid,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
        promptSource: {
          commit,
        },
        tools: {},
        abortSignal: undefined,
        simulationSettings: undefined,
        source: 'test',
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'no_params',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })

    it('handles empty tools object in streamManager', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/empty-tools',
        content: '---\nname: Empty Tools\n---\nContent',
      })

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Agent with empty tools',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/empty-tools',
          documentUuid: agent.documentUuid,
        },
      }

      const streamManager = {
        workspace,
        $completion: {
          context: {},
        },
        promptSource: {
          commit,
        },
        tools: {},
        abortSignal: undefined,
        simulationSettings: undefined,
        source: 'test',
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'empty_tools',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
    })
  })

  describe('execute function behavior', () => {
    const createMockUsage = (multiplier: number = 1) => ({
      inputTokens: 100 * multiplier,
      outputTokens: 50 * multiplier,
      promptTokens: 100 * multiplier,
      completionTokens: 50 * multiplier,
      totalTokens: 150 * multiplier,
      reasoningTokens: 10 * multiplier,
      cachedInputTokens: 5 * multiplier,
    })

    it('propagates runUsage from sub-agent to parent streamManager', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/usage-agent',
        content: '---\nname: Usage Agent\n---\nContent',
      })

      const mockUsage = createMockUsage(2)
      vi.mocked(commitsModule.runDocumentAtCommit).mockResolvedValue(
        Result.ok({
          response: Promise.resolve({
            streamType: 'text',
            text: 'Sub-agent response',
          }),
          stream: new ReadableStream(),
          error: Promise.resolve(undefined),
          runUsage: Promise.resolve(mockUsage),
          runCost: Promise.resolve(0.02),
        }) as any,
      )

      const incrementRunUsageMock = vi.fn()
      const incrementRunCostMock = vi.fn()

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Usage agent',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/usage-agent',
          documentUuid: agent.documentUuid,
        },
      }

      const streamManager = {
        workspace,
        $context: BACKGROUND({ workspaceId: workspace.id }),
        promptSource: { commit },
        tools: {},
        abortSignal: undefined,
        simulationSettings: undefined,
        source: 'test',
        controller: undefined,
        incrementRunUsage: incrementRunUsageMock,
        incrementRunCost: incrementRunCostMock,
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'usage_agent',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!

      await tool.execute!({}, { toolCallId: 'call-123' } as any)

      expect(incrementRunUsageMock).toHaveBeenCalledWith(mockUsage)
    })

    it('propagates runCost from sub-agent to parent streamManager', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/cost-agent',
        content: '---\nname: Cost Agent\n---\nContent',
      })

      const mockCost = 0.05
      vi.mocked(commitsModule.runDocumentAtCommit).mockResolvedValue(
        Result.ok({
          response: Promise.resolve({ streamType: 'text', text: 'Response' }),
          stream: new ReadableStream(),
          error: Promise.resolve(undefined),
          runUsage: Promise.resolve(createMockUsage()),
          runCost: Promise.resolve(mockCost),
        }) as any,
      )

      const incrementRunUsageMock = vi.fn()
      const incrementRunCostMock = vi.fn()

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Cost agent',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/cost-agent',
          documentUuid: agent.documentUuid,
        },
      }

      const streamManager = {
        workspace,
        $context: BACKGROUND({ workspaceId: workspace.id }),
        promptSource: { commit },
        tools: {},
        abortSignal: undefined,
        simulationSettings: undefined,
        source: 'test',
        controller: undefined,
        incrementRunUsage: incrementRunUsageMock,
        incrementRunCost: incrementRunCostMock,
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'cost_agent',
        toolManifest,
        streamManager,
      })

      expect(result.ok).toBe(true)
      const tool = result.value!

      await tool.execute!({}, { toolCallId: 'call-456' } as any)

      expect(incrementRunCostMock).toHaveBeenCalledWith(mockCost)
    })

    it('returns text response from sub-agent', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/text-response',
        content: '---\nname: Text Response\n---\nContent',
      })

      vi.mocked(commitsModule.runDocumentAtCommit).mockResolvedValue(
        Result.ok({
          response: Promise.resolve({
            streamType: 'text',
            text: 'Hello from sub-agent',
          }),
          stream: new ReadableStream(),
          error: Promise.resolve(undefined),
          runUsage: Promise.resolve(createMockUsage()),
          runCost: Promise.resolve(0.01),
        }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Text response agent',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/text-response',
          documentUuid: agent.documentUuid,
        },
      }

      const streamManager = {
        workspace,
        $context: BACKGROUND({ workspaceId: workspace.id }),
        promptSource: { commit },
        tools: {},
        abortSignal: undefined,
        simulationSettings: undefined,
        source: 'test',
        controller: undefined,
        incrementRunUsage: vi.fn(),
        incrementRunCost: vi.fn(),
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'text_response',
        toolManifest,
        streamManager,
      })

      const tool = result.value!
      const executeResult = await tool.execute!({}, {
        toolCallId: 'call-789',
      } as any)

      expect(executeResult).toEqual({
        value: 'Hello from sub-agent',
        isError: false,
      })
    })

    it('returns object response from sub-agent', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/object-response',
        content: '---\nname: Object Response\n---\nContent',
      })

      const responseObject = { status: 'success', data: [1, 2, 3] }
      vi.mocked(commitsModule.runDocumentAtCommit).mockResolvedValue(
        Result.ok({
          response: Promise.resolve({
            streamType: 'object',
            object: responseObject,
          }),
          stream: new ReadableStream(),
          error: Promise.resolve(undefined),
          runUsage: Promise.resolve(createMockUsage()),
          runCost: Promise.resolve(0.01),
        }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Object response agent',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/object-response',
          documentUuid: agent.documentUuid,
        },
      }

      const streamManager = {
        workspace,
        $context: BACKGROUND({ workspaceId: workspace.id }),
        promptSource: { commit },
        tools: {},
        abortSignal: undefined,
        simulationSettings: undefined,
        source: 'test',
        controller: undefined,
        incrementRunUsage: vi.fn(),
        incrementRunCost: vi.fn(),
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'object_response',
        toolManifest,
        streamManager,
      })

      const tool = result.value!
      const executeResult = await tool.execute!({}, {
        toolCallId: 'call-obj',
      } as any)

      expect(executeResult).toEqual({
        value: responseObject,
        isError: false,
      })
    })

    it('returns error result when sub-agent fails', async () => {
      const { documentVersion: agent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/error-agent',
        content: '---\nname: Error Agent\n---\nContent',
      })

      const errorMessage = 'Sub-agent execution failed'
      vi.mocked(commitsModule.runDocumentAtCommit).mockResolvedValue(
        Result.ok({
          response: Promise.resolve(undefined),
          stream: new ReadableStream(),
          error: Promise.resolve(new Error(errorMessage)),
          runUsage: Promise.resolve(createMockUsage()),
          runCost: Promise.resolve(0),
        }) as any,
      )

      const toolManifest: ToolManifest<ToolSource.Agent> = {
        definition: {
          description: 'Error agent',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
        },
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/error-agent',
          documentUuid: agent.documentUuid,
        },
      }

      const streamManager = {
        workspace,
        $context: BACKGROUND({ workspaceId: workspace.id }),
        promptSource: { commit },
        tools: {},
        abortSignal: undefined,
        simulationSettings: undefined,
        source: 'test',
        controller: undefined,
        incrementRunUsage: vi.fn(),
        incrementRunCost: vi.fn(),
      } as unknown as StreamManager

      const result = await resolveAgentAsToolDefinition({
        toolName: 'error_agent',
        toolManifest,
        streamManager,
      })

      const tool = result.value!
      const executeResult = await tool.execute!({}, {
        toolCallId: 'call-err',
      } as any)

      expect(executeResult).toEqual({
        value: errorMessage,
        isError: true,
      })
    })
  })
})
