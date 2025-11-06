import { describe, it, expect, beforeEach } from 'vitest'
import { lookupAgentsAsTools } from './agentsAsTools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { DocumentVersion } from '../../../../schema/models/types/DocumentVersion'
import { createProject } from '../../../../tests/factories/projects'
import { createDocumentVersion } from '../../../../tests/factories/documents'
import { createDraft } from '../../../../tests/factories/commits'
import { Commit } from '../../../../schema/models/types/Commit'

describe('lookupAgentsAsTools', () => {
  let project: any
  let commit: Commit
  let workspace: any
  let user: any
  let parentDocument: DocumentVersion
  let agentDocument: DocumentVersion
  let regularDocument: DocumentVersion

  beforeEach(async () => {
    const {
      workspace: ws,
      project: createdProject,
      user: createdUser,
    } = await createProject()
    workspace = ws
    project = createdProject
    user = createdUser

    const { commit: draftCommit } = await createDraft({ project, user })
    commit = draftCommit

    const { documentVersion: parent } = await createDocumentVersion({
      workspace,
      user,
      commit,
      path: 'parent',
      content: 'Parent document',
    })
    parentDocument = parent

    const { documentVersion: agent } = await createDocumentVersion({
      workspace,
      user,
      commit,
      path: 'agents/my-agent',
      content:
        '---\nname: My Agent\ndescription: Test agent\n---\nAgent content',
    })
    agentDocument = agent

    const { documentVersion: regular } = await createDocumentVersion({
      workspace,
      user,
      commit,
      path: 'regular-doc',
      content: 'Regular document',
    })
    regularDocument = regular
  })

  describe('when no agents are specified', () => {
    it('returns empty object', async () => {
      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: undefined,
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentDocument.documentUuid,
        documents: [parentDocument],
      })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })

    it('returns empty object when agents array is empty', async () => {
      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: [],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentDocument.documentUuid,
        documents: [parentDocument],
      })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
    })
  })

  describe('with agent paths', () => {
    it('lookups agent by absolute path', async () => {
      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['agents/my-agent'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentDocument.documentUuid,
        documents: [parentDocument, agentDocument],
      })

      expect(result.ok).toBe(true)
      const tools = Object.values(result.value!)
      expect(tools.length).toBe(1)
      expect(tools[0]!.sourceData.source).toBe(ToolSource.Agent)
      expect(tools[0]!.sourceData.agentPath).toBe('agents/my-agent')
      expect(tools[0]!.sourceData.documentUuid).toBe(agentDocument.documentUuid)
    })

    it('lookups agent by relative path', async () => {
      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['./my-agent'],
      }

      const { documentVersion: parentInAgentsFolder } =
        await createDocumentVersion({
          workspace,
          user,
          commit,
          path: 'agents/parent',
          content: 'Parent in agents folder',
        })

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentInAgentsFolder.documentUuid,
        documents: [parentInAgentsFolder, agentDocument],
      })

      expect(result.ok).toBe(true)
      const tools = Object.values(result.value!)
      expect(tools.length).toBe(1)
    })

    it('lookups multiple agents', async () => {
      const { documentVersion: agent2 } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'agents/agent2',
        content:
          '---\nname: Agent 2\ndescription: Second agent\n---\nAgent 2 content',
      })

      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['agents/my-agent', 'agents/agent2'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentDocument.documentUuid,
        documents: [parentDocument, agentDocument, agent2],
      })

      expect(result.ok).toBe(true)
      expect(Object.keys(result.value!).length).toBe(2)
    })

    it('returns error when document uuid not found', async () => {
      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['agents/my-agent'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: 'non-existent-uuid',
        documents: [parentDocument, agentDocument],
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain('Document not found')
    })

    it('returns error when agent path not found', async () => {
      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['agents/non-existent'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentDocument.documentUuid,
        documents: [parentDocument, agentDocument],
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain('Documents not found')
      expect(result.error!.message).toContain('agents/non-existent')
    })

    it('returns error when multiple agent paths not found', async () => {
      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['agents/missing1', 'agents/missing2'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentDocument.documentUuid,
        documents: [parentDocument],
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain('agents/missing1')
      expect(result.error!.message).toContain('agents/missing2')
    })

    it('returns error when document is not an agent', async () => {
      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['regular-doc'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentDocument.documentUuid,
        documents: [parentDocument, regularDocument],
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        "Document 'regular-doc' is not an agent",
      )
    })

    it('returns error when multiple documents are not agents', async () => {
      const { documentVersion: regular2 } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'regular-doc2',
        content: 'Another regular document',
      })

      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['regular-doc', 'regular-doc2'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentDocument.documentUuid,
        documents: [parentDocument, regularDocument, regular2],
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain('Documents are not agents')
      expect(result.error!.message).toContain('regular-doc')
      expect(result.error!.message).toContain('regular-doc2')
    })

    it('handles mixed valid and invalid agents', async () => {
      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['agents/my-agent', 'agents/non-existent'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentDocument.documentUuid,
        documents: [parentDocument, agentDocument],
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain('Documents not found')
    })
  })

  describe('tool manifest structure', () => {
    it('creates correct manifest with tool definition', async () => {
      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['agents/my-agent'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentDocument.documentUuid,
        documents: [parentDocument, agentDocument],
      })

      expect(result.ok).toBe(true)
      const manifest = Object.values(result.value!)[0]
      expect(manifest).toMatchObject({
        definition: expect.objectContaining({
          description: expect.any(String),
        }),
        sourceData: {
          source: ToolSource.Agent,
          agentPath: 'agents/my-agent',
          documentUuid: agentDocument.documentUuid,
        },
      })
    })

    it('uses correct tool name from agent', async () => {
      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['agents/my-agent'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentDocument.documentUuid,
        documents: [parentDocument, agentDocument],
      })

      expect(result.ok).toBe(true)
      const toolNames = Object.keys(result.value!)
      expect(toolNames.length).toBe(1)
      expect(toolNames[0]).toBeTruthy()
    })
  })

  describe('relative path resolution', () => {
    it('resolves relative paths correctly from parent directory', async () => {
      const { documentVersion: parentInRoot } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'root-parent',
        content: 'Parent in root',
      })

      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['./agents/my-agent'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: parentInRoot.documentUuid,
        documents: [parentInRoot, agentDocument],
      })

      expect(result.ok).toBe(true)
      expect(Object.keys(result.value!).length).toBe(1)
    })

    it('resolves parent directory paths', async () => {
      const { documentVersion: deepParent } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'deep/nested/parent',
        content: 'Deep parent',
      })

      const { documentVersion: agentInRoot } = await createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'root-agent',
        content:
          '---\nname: Root Agent\ndescription: Agent in root\n---\nContent',
      })

      const config: Pick<LatitudePromptConfig, 'agents'> = {
        agents: ['../../root-agent'],
      }

      const result = await lookupAgentsAsTools({
        config,
        documentUuid: deepParent.documentUuid,
        documents: [deepParent, agentInRoot],
      })

      expect(result.ok).toBe(true)
      expect(Object.keys(result.value!).length).toBe(1)
    })
  })
})
