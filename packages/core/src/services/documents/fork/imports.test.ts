import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IntegrationType, Providers } from '@latitude-data/constants'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../../schema/models/types/Workspace'
import * as factories from '../../../tests/factories'
import { getImports } from './imports'

describe('getImports', () => {
  let workspace: Workspace
  let commit: Commit
  let documents: DocumentVersion[]

  beforeEach(async () => {
    const setup = await factories.createProject({
      skipMerge: true, // Skip validation to avoid document errors
      providers: [
        { name: 'openai', type: Providers.OpenAI },
        { name: 'anthropic', type: Providers.Anthropic },
      ],
      documents: {
        // Main document that imports others
        main: factories.helpers.createPrompt({
          provider: 'openai',
          content: `
Main document:
<prompt path="./snippet1" />
<prompt path="./folder/snippet2" />
          `,
          extraConfig: {
            agents: ['./agents/agent1', './agents/agent2'],
            tools: ['integration1/tool1', 'integration2/tool2'],
          },
        }),
        // Simple snippet
        snippet1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Simple snippet content',
        }),
        // Nested folder structure
        folder: {
          snippet2: factories.helpers.createPrompt({
            provider: 'anthropic',
            content: `
Nested snippet:
<prompt path="../snippet1" />
            `,
          }),
        },
        // Agents
        agents: {
          agent1: factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Agent 1 content',
            extraConfig: {
              type: 'agent',
              agents: ['./agent2'],
            },
          }),
          agent2: factories.helpers.createPrompt({
            provider: 'anthropic',
            content: `
Agent 2 content:
<prompt path="../snippet1" />
            `,
            extraConfig: {
              type: 'agent',
              tools: ['integration3/tool3'],
            },
          }),
        },
        // Standalone document (not imported by main)
        standalone: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Standalone document',
        }),
      },
    })

    workspace = setup.workspace
    commit = setup.commit
    documents = setup.documents
  })

  it('returns basic document imports with snippets and agents', async () => {
    const mainDoc = documents.find((d) => d.path === 'main')!

    const result = await getImports({
      workspace,
      commit,
      document: mainDoc,
    })

    expect(result.ok).toBe(true)
    const imports = result.unwrap()

    expect(imports.document).toEqual(mainDoc)
    expect(imports.snippets).toHaveLength(2)
    expect(imports.agents).toHaveLength(2)

    // Check snippet paths
    const snippetPaths = imports.snippets.map((s) => s.path).sort()
    expect(snippetPaths).toEqual(['folder/snippet2', 'snippet1'])

    // Check agent paths
    const agentPaths = imports.agents.map((a) => a.path).sort()
    expect(agentPaths).toEqual(['agents/agent1', 'agents/agent2'])
  })

  it('resolves recursive imports correctly', async () => {
    const mainDoc = documents.find((d) => d.path === 'main')!

    const result = await getImports({
      workspace,
      commit,
      document: mainDoc,
    })

    const imports = result.unwrap()

    // snippet1 should be included even though it's referenced by both main and folder/snippet2
    const snippet1 = imports.snippets.find((s) => s.path === 'snippet1')
    expect(snippet1).toBeDefined()

    // folder/snippet2 should be included as it's referenced by main
    const snippet2 = imports.snippets.find((s) => s.path === 'folder/snippet2')
    expect(snippet2).toBeDefined()
  })

  it('handles agent hierarchy correctly', async () => {
    const mainDoc = documents.find((d) => d.path === 'main')!

    const result = await getImports({
      workspace,
      commit,
      document: mainDoc,
    })

    const imports = result.unwrap()

    // Both agents should be included
    expect(imports.agents).toHaveLength(2)

    // agent1 references agent2, but both should be in agents, not snippets
    const agent1 = imports.agents.find((a) => a.path === 'agents/agent1')
    const agent2 = imports.agents.find((a) => a.path === 'agents/agent2')
    expect(agent1).toBeDefined()
    expect(agent2).toBeDefined()

    // snippet1 should still be in snippets even though referenced by agent2
    const snippet1 = imports.snippets.find((s) => s.path === 'snippet1')
    expect(snippet1).toBeDefined()
  })

  it('detects integrations from document tools configuration', async () => {
    // Create integrations in the workspace
    await factories.createIntegration({
      workspace,
      name: 'integration1',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://example1.com' },
    })

    await factories.createIntegration({
      workspace,
      name: 'integration2',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://example2.com' },
    })

    await factories.createIntegration({
      workspace,
      name: 'integration3',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://example3.com' },
    })

    // Create unused integration
    await factories.createIntegration({
      workspace,
      name: 'unused',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://unused.com' },
    })

    const mainDoc = documents.find((d) => d.path === 'main')!

    const result = await getImports({
      workspace,
      commit,
      document: mainDoc,
    })

    const imports = result.unwrap()

    // Should include integrations from main document and agent2
    expect(imports.integrations).toHaveLength(3)

    const integrationNames = imports.integrations.map((i) => i.name).sort()
    expect(integrationNames).toEqual([
      'integration1',
      'integration2',
      'integration3',
    ])

    // Should not include unused integration
    expect(
      imports.integrations.find((i) => i.name === 'unused'),
    ).toBeUndefined()
  })

  it('includes document triggers in the result', async () => {
    const mainDoc = documents.find((d) => d.path === 'main')!

    // Create some triggers for the document
    await factories.createScheduledDocumentTrigger({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      commitId: commit.id,
      documentUuid: mainDoc.documentUuid,
    })

    const result = await getImports({
      workspace,
      commit,
      document: mainDoc,
    })

    const imports = result.unwrap()

    expect(imports.triggers).toHaveLength(1)
    expect(imports.triggers[0].documentUuid).toBe(mainDoc.documentUuid)
  })

  it('handles documents with no imports', async () => {
    const standaloneDoc = documents.find((d) => d.path === 'standalone')!

    const result = await getImports({
      workspace,
      commit,
      document: standaloneDoc,
    })

    expect(result.ok).toBe(true)
    const imports = result.unwrap()

    expect(imports.document).toEqual(standaloneDoc)
    expect(imports.snippets).toHaveLength(0)
    expect(imports.agents).toHaveLength(0)
    expect(imports.integrations).toHaveLength(0)
    expect(imports.triggers).toHaveLength(0)
  })

  it('prevents circular references', async () => {
    // Create documents with circular references
    const {
      workspace: circularWorkspace,
      commit: circularCommit,
      documents: circularDocs,
    } = await factories.createProject({
      skipMerge: true,
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: '<prompt path="./doc2" />',
        }),
        doc2: factories.helpers.createPrompt({
          provider: 'openai',
          content: '<prompt path="./doc1" />',
        }),
      },
    })

    const doc1 = circularDocs.find((d) => d.path === 'doc1')!

    const result = await getImports({
      workspace: circularWorkspace,
      commit: circularCommit,
      document: doc1,
    })

    expect(result.ok).toBe(true)
    const imports = result.unwrap()

    // Should handle circular reference gracefully
    expect(imports.snippets).toHaveLength(1)
    expect(imports.snippets[0].path).toBe('doc2')
  })

  it('handles missing referenced documents gracefully', async () => {
    const {
      workspace: missingWorkspace,
      commit: missingCommit,
      documents: missingDocs,
    } = await factories.createProject({
      skipMerge: true,
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        main: factories.helpers.createPrompt({
          provider: 'openai',
          content: `
<prompt path="./existing" />
<prompt path="./nonexistent" />
            `,
        }),
        existing: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Existing document',
        }),
      },
    })

    const mainDoc = missingDocs.find((d) => d.path === 'main')!

    const result = await getImports({
      workspace: missingWorkspace,
      commit: missingCommit,
      document: mainDoc,
    })

    expect(result.ok).toBe(true)
    const imports = result.unwrap()

    // Should only include existing documents
    expect(imports.snippets).toHaveLength(1)
    expect(imports.snippets[0].path).toBe('existing')
  })

  it('treats documents as agents when referenced both as agent and snippet', async () => {
    const {
      workspace: mixedWorkspace,
      commit: mixedCommit,
      documents: mixedDocs,
    } = await factories.createProject({
      skipMerge: true,
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        main: factories.helpers.createPrompt({
          provider: 'openai',
          content: '<prompt path="./shared" />',
          extraConfig: {
            agents: ['./shared'],
          },
        }),
        shared: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Shared document',
          extraConfig: {
            type: 'agent',
          },
        }),
      },
    })

    const mainDoc = mixedDocs.find((d) => d.path === 'main')!

    const result = await getImports({
      workspace: mixedWorkspace,
      commit: mixedCommit,
      document: mainDoc,
    })

    const imports = result.unwrap()

    // Document should be treated as agent, not snippet
    expect(imports.agents).toHaveLength(1)
    expect(imports.agents[0].path).toBe('shared')
    expect(imports.snippets).toHaveLength(0)
  })

  it('handles integration tools with invalid formats', async () => {
    const {
      workspace: invalidWorkspace,
      commit: invalidCommit,
      documents: invalidDocs,
    } = await factories.createProject({
      skipMerge: true,
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        main: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Main document',
          extraConfig: {
            tools: [
              'valid_integration/tool1',
              'invalid_tool_no_slash',
              '/starts_with_slash',
              'ends_with_slash/',
              '',
            ],
          },
        }),
      },
    })

    // Create only the valid integration
    await factories.createIntegration({
      workspace: invalidWorkspace,
      name: 'valid_integration',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://valid.com' },
    })

    const mainDoc = invalidDocs.find((d) => d.path === 'main')!

    const result = await getImports({
      workspace: invalidWorkspace,
      commit: invalidCommit,
      document: mainDoc,
    })

    const imports = result.unwrap()

    // Should only include the valid integration
    expect(imports.integrations).toHaveLength(1)
    expect(imports.integrations[0].name).toBe('valid_integration')
  })

  it('handles error when document repository fails', async () => {
    const mainDoc = documents.find((d) => d.path === 'main')!

    // Mock the repository to fail
    const mockError = new Error('Repository error')
    vi.spyOn(
      await import('../../../repositories/documentVersionsRepository'),
      'DocumentVersionsRepository',
    ).mockImplementation(
      () =>
        ({
          getDocumentsAtCommit: vi.fn().mockResolvedValue({
            error: mockError,
            ok: false,
          }),
        }) as any,
    )

    const result = await getImports({
      workspace,
      commit,
      document: mainDoc,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(mockError)

    vi.restoreAllMocks()
  })

  it('handles error when integrations query fails', async () => {
    const mainDoc = documents.find((d) => d.path === 'main')!

    // Mock the integrations query to fail
    const mockError = new Error('Integrations repository error')
    const findAllModule = await import(
      '../../../queries/integrations/findAll'
    )
    vi.spyOn(findAllModule, 'findAllIntegrations').mockRejectedValue(mockError)

    const result = await getImports({
      workspace,
      commit,
      document: mainDoc,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(mockError)

    vi.restoreAllMocks()
  })

  it('handles error when triggers repository fails', async () => {
    const mainDoc = documents.find((d) => d.path === 'main')!

    // Mock the triggers repository to fail
    const mockError = new Error('Triggers repository error')
    vi.spyOn(
      await import('../../../repositories/documentTriggersRepository'),
      'DocumentTriggersRepository',
    ).mockImplementation(
      () =>
        ({
          getTriggersInDocument: vi.fn().mockResolvedValue({
            error: mockError,
            ok: false,
          }),
        }) as any,
    )

    const result = await getImports({
      workspace,
      commit,
      document: mainDoc,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(mockError)

    vi.restoreAllMocks()
  })
})
