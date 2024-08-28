import { updateDocument } from '@latitude-data/core'
import { DocumentVersion, Project, SafeUser } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateDocumentContentAction } from './updateContent'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('updateDocumentAction', async () => {
  describe('unauthorized', () => {
    let projectId: number
    let doc1: DocumentVersion

    beforeEach(async () => {
      const { workspace } = await factories.createWorkspace()
      const { documents, project } = await factories.createProject({
        workspace,
        documents: {
          doc1: 'foo',
        },
      })
      doc1 = documents.filter((d) => d.path === 'doc1')[0]!
      projectId = project.id
    })

    it('errors when the user is not authenticated', async () => {
      const [_, error] = await updateDocumentContentAction({
        projectId,
        documentUuid: doc1.documentUuid,
        commitId: doc1.commitId,
        content: 'foo2',
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    let project: Project
    let doc1: DocumentVersion
    let user: SafeUser

    beforeEach(async () => {
      const { workspace, userData } = await factories.createWorkspace()
      const { documents, project: projectData } = await factories.createProject(
        {
          workspace,
          documents: {
            doc1: 'foo',
          },
        },
      )
      doc1 = documents.filter((d) => d.path === 'doc1')[0]!
      project = projectData
      user = userData

      mocks.getSession.mockReturnValue({
        user: userData,
      })
    })

    it('modifies the document version when it already exists in the draft', async () => {
      const { commit: draft } = await factories.createDraft({ project, user })
      await updateDocument({
        commit: draft,
        document: doc1,
        content: 'foo2',
      })

      const [data, error] = await updateDocumentContentAction({
        projectId: project.id,
        documentUuid: doc1.documentUuid,
        commitId: draft.id,
        content: 'foo3',
      })

      expect(error).toBeNull()
      expect(data).toMatchObject({
        documentUuid: doc1.documentUuid,
        commitId: draft.id,
        content: 'foo3',
      })
    })

    it('creates a new document version when it does not exist in the draft', async () => {
      const { commit: draft } = await factories.createDraft({ project, user })

      const [data, error] = await updateDocumentContentAction({
        projectId: project.id,
        documentUuid: doc1.documentUuid,
        commitId: draft.id,
        content: 'foo2',
      })

      expect(error).toBeNull()
      expect(data).toMatchObject({
        documentUuid: doc1.documentUuid,
        commitId: draft.id,
        content: 'foo2',
      })
    })
  })
})
