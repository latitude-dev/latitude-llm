import { describe, expect, it, vi } from 'vitest'

import { DocumentTriggerType } from '@latitude-data/constants'
import { Commit, DocumentVersion, User, Workspace } from '../../../schema/types'
import { forkDocument } from '.'

const publisherSpy = vi.spyOn(
  await import('../../../events/publisher').then((f) => f.publisher),
  'publishLater',
)

describe('forkDocument', () => {
  it('returns correct structure with triggers included', async () => {
    // Mock all the service dependencies to avoid complex setup
    const mockProject = { id: 1, name: 'Copy of Test', workspaceId: 1 }
    const mockCommit = { id: 1, projectId: 1, uuid: 'commit-uuid' }
    const mockDocument = {
      id: 1,
      path: 'test',
      commitId: 1,
      documentUuid: 'doc-uuid',
      content: 'test content',
    }
    const mockTriggers = [
      {
        id: 1,
        documentUuid: 'doc-uuid',
        triggerType: DocumentTriggerType.Scheduled,
      },
    ]

    // Mock createForkProject
    vi.spyOn(
      await import('./createProject'),
      'createForkProject',
    ).mockResolvedValue({
      ok: true,
      value: { commit: mockCommit, project: mockProject },
      unwrap: () => ({ commit: mockCommit, project: mockProject }),
    } as any)

    // Mock getImports
    vi.spyOn(await import('./imports'), 'getImports').mockResolvedValue({
      ok: true,
      value: {
        document: mockDocument,
        agents: [],
        snippets: [],
        integrations: [],
        triggers: mockTriggers,
      },
      unwrap: () => ({
        document: mockDocument,
        agents: [],
        snippets: [],
        integrations: [],
        triggers: mockTriggers,
      }),
    } as any)

    // Mock cloneIntegrations
    vi.spyOn(
      await import('./cloneIntegrations'),
      'cloneIntegrations',
    ).mockResolvedValue({
      ok: true,
      value: { name: {}, id: {} },
      unwrap: () => ({ name: {}, id: {} }),
    } as any)

    // Mock cloneDocuments
    vi.spyOn(
      await import('./cloneDocuments'),
      'cloneDocuments',
    ).mockResolvedValue({
      ok: true,
      value: [mockDocument],
      unwrap: () => [mockDocument],
    } as any)

    // Mock cloneDocumentTriggers
    vi.spyOn(
      await import('./cloneTriggers'),
      'cloneDocumentTriggers',
    ).mockResolvedValue({
      ok: true,
      value: mockTriggers,
      unwrap: () => mockTriggers,
    } as any)

    const result = await forkDocument({
      title: 'Test',
      origin: {
        workspace: { id: 1 } as Workspace,
        commit: { id: 1, uuid: 'test-uuid' } as Commit,
        document: { documentUuid: 'test-doc', path: 'test' } as DocumentVersion,
      },
      destination: {
        workspace: { id: 2 } as Workspace,
        user: { email: 'test@example.com' } as User,
      },
    })

    expect(result.ok).toBe(true)
    const { project, commit, document, triggers } = result.unwrap()

    // Verify the new service returns triggers
    expect(project).toEqual(mockProject)
    expect(commit).toEqual(mockCommit)
    expect(document).toEqual(mockDocument)
    expect(triggers).toEqual(mockTriggers)

    // Verify event was published
    expect(publisherSpy).toHaveBeenCalledWith({
      type: 'forkDocumentRequested',
      data: {
        origin: {
          workspaceId: 1,
          commitUuid: 'test-uuid',
          documentUuid: 'test-doc',
        },
        destination: {
          workspaceId: 2,
          userEmail: 'test@example.com',
        },
      },
    })

    vi.restoreAllMocks()
  })

  it('handles errors from any step in the pipeline', async () => {
    const mockError = new Error('Test error')

    // Mock createForkProject to succeed
    vi.spyOn(
      await import('./createProject'),
      'createForkProject',
    ).mockResolvedValue({
      ok: true,
      value: { commit: { id: 1 }, project: { id: 1 } },
      unwrap: () => ({ commit: { id: 1 }, project: { id: 1 } }),
    } as any)

    // Mock getImports to fail - this should cause the service to return an error
    vi.spyOn(await import('./imports'), 'getImports').mockResolvedValue({
      ok: false,
      error: mockError,
      unwrap: () => {
        throw mockError
      },
    } as any)

    // The service should handle the error and return a Result with ok: false
    try {
      const result = await forkDocument({
        title: 'Test',
        origin: {
          workspace: { id: 1 } as Workspace,
          commit: { id: 1, uuid: 'test-uuid' } as Commit,
          document: {
            documentUuid: 'test-doc',
            path: 'test',
          } as DocumentVersion,
        },
        destination: {
          workspace: { id: 2 } as Workspace,
          user: { email: 'test@example.com' } as User,
        },
      })

      // If we get here, the service should have returned an error result
      expect(result.ok).toBe(false)
    } catch (error) {
      // If the service throws, that's also acceptable error handling
      expect(error).toBe(mockError)
    }

    vi.restoreAllMocks()
  })
})
