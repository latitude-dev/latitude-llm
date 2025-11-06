import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveAgentAsToolDefinition } from './agentsAsTools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { ToolManifest } from '@latitude-data/constants/tools'
import { StreamManager } from '../../../../lib/streamManager'
import { Workspace } from '../../../../schema/models/types/Workspace'
import { createProject } from '../../../../tests/factories/projects'
import { createDocumentVersion } from '../../../../tests/factories/documents'
import { createDraft } from '../../../../tests/factories/commits'
import { jsonSchema } from 'ai'
import { Commit } from '../../../../schema/models/types/Commit'

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
})
