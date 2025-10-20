import { HEAD_COMMIT, Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it } from 'vitest'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { mergeCommit } from '../../services/commits'
import { updateDocument } from '../../services/documents'
import * as factories from '../../tests/factories'
import { CommitsRepository } from '../commitsRepository'
import { DocumentVersionsRepository } from './index'

let documentsByContent: Record<
  string,
  {
    project: Project
    commit: Commit
    document: DocumentVersion
    documentsScope: DocumentVersionsRepository
  }
> = {}

describe('getDocumentsAtCommit', () => {
  it('returns the document of the only commit', async (ctx) => {
    const {
      project,
      commit,
      documents: allDocs,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: ctx.factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })

    const documentsScope = new DocumentVersionsRepository(project.workspaceId)
    const result = await documentsScope.getDocumentsAtCommit(commit)
    const documents = result.unwrap()

    expect(documents.length).toBe(1)
    expect(documents[0]!.documentUuid).toBe(allDocs[0]!.documentUuid)
  })

  it('get docs from HEAD without soft deleted', async (ctx) => {
    const { commit, project, documents, user } =
      await ctx.factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          doc1: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Doc 1',
          }),
          doc2: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Doc 2',
          }),
        },
      })
    const documentsScope = new DocumentVersionsRepository(project.workspaceId)
    const { commit: draft } = await factories.createDraft({ project, user })
    await factories.markAsSoftDelete({
      documentUuid: documents.find((d) => d.path === 'doc2')!.documentUuid,
      commitId: commit.id,
    })
    const filteredDocs = await documentsScope
      .getDocumentsAtCommit(draft)
      .then((r) => r.unwrap())
    const contents = filteredDocs.map((d) => d.content)
    expect(contents.length).toBe(1)
    expect(contents[0]).toContain('Doc 1')
  })

  describe('documents for each commit', () => {
    beforeEach(async (ctx) => {
      const { project, user, workspace, providers } =
        await ctx.factories.createProject()
      const documentsScope = new DocumentVersionsRepository(project.workspaceId)
      const { commit: commit1 } = await factories.createDraft({ project, user })
      const { commit: commit2 } = await factories.createDraft({ project, user })
      const { commit: commit3 } = await factories.createDraft({ project, user })

      // Initial document
      const { documentVersion: doc1 } = await factories.createDocumentVersion({
        workspace,
        user,
        commit: commit1,
        path: 'doc1',
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'VERSION_1',
        }),
      })
      await mergeCommit(commit1).then((r) => r.unwrap())

      // Version 2 is merged
      const doc2 = await updateDocument({
        commit: commit2,
        document: doc1!,
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'VERSION_2',
        }),
      }).then((r) => r.unwrap())
      await mergeCommit(commit2).then((r) => r.unwrap())

      // A new draft is created
      const doc3 = await updateDocument({
        commit: commit3,
        document: doc1!,
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'VERSION_3_draft',
        }),
      }).then((r) => r.unwrap())

      documentsByContent = {
        VERSION_1: { project, document: doc1, commit: commit1, documentsScope },
        VERSION_2: { project, document: doc2, commit: commit2, documentsScope },
        VERSION_3_draft: {
          project,
          document: doc3,
          commit: commit3,
          documentsScope,
        },
      }
    })

    it('get docs from version 1', async () => {
      const { project, commit } = documentsByContent.VERSION_1!
      const documentsScope = new DocumentVersionsRepository(project.workspaceId)
      const documents = await documentsScope
        .getDocumentsAtCommit(commit)
        .then((r) => r.unwrap())

      expect(documents.length).toBe(1)
      expect(documents[0]!.content).toContain('VERSION_1')
    })

    it('get docs from version 2', async () => {
      const { project, commit } = documentsByContent.VERSION_2!
      const documentsScope = new DocumentVersionsRepository(project.workspaceId)
      const documents = await documentsScope
        .getDocumentsAtCommit(commit)
        .then((r) => r.unwrap())

      expect(documents.length).toBe(1)
      expect(documents[0]!.content).toContain('VERSION_2')
    })

    it('get docs from version 3', async () => {
      const { project, commit } = documentsByContent.VERSION_3_draft!
      const documentsScope = new DocumentVersionsRepository(project.workspaceId)
      const documents = await documentsScope
        .getDocumentsAtCommit(commit)
        .then((r) => r.unwrap())

      expect(documents.length).toBe(1)
      expect(documents[0]!.content).toContain('VERSION_3_draft')
    })

    it('get docs from HEAD', async () => {
      const { project } = documentsByContent.VERSION_1!
      const commitsScope = new CommitsRepository(project.workspaceId)
      const documentsScope = new DocumentVersionsRepository(project.workspaceId)
      const commit = await commitsScope
        .getCommitByUuid({
          projectId: project.id,
          uuid: HEAD_COMMIT,
        })
        .then((r) => r.unwrap())
      const documents = await documentsScope
        .getDocumentsAtCommit(commit)
        .then((r) => r.unwrap())

      expect(documents.length).toBe(1)
      expect(documents[0]!.content).toContain('VERSION_2')
    })
  })

  describe('documents from previous commits', () => {
    beforeEach(async (ctx) => {
      const { project, user, workspace, providers } =
        await ctx.factories.createProject()
      const documentsScope = new DocumentVersionsRepository(project.workspaceId)

      // Doc 1
      const { commit: commit1 } = await factories.createDraft({ project, user })
      const { documentVersion: doc1 } = await factories.createDocumentVersion({
        workspace,
        user,
        commit: commit1,
        path: 'doc1',
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'Doc_1_commit_1',
        }),
      })
      const mergedCommit1 = await mergeCommit(commit1).then((r) => r.unwrap())

      // Doc 2
      const { commit: commit2 } = await factories.createDraft({ project, user })
      const { documentVersion: doc2 } = await factories.createDocumentVersion({
        workspace,
        user,
        commit: commit2,
        path: 'doc2',
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'Doc_2_commit_2',
        }),
      })
      const mergedCommit2 = await mergeCommit(commit2).then((r) => r.unwrap())

      // Doc 3
      const { commit: commit3 } = await factories.createDraft({ project, user })
      const doc3 = await updateDocument({
        commit: commit3,
        document: doc2,
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'Doc_2_commit_3_draft',
        }),
      }).then((r) => r.unwrap())

      documentsByContent = {
        commit1: {
          project,
          document: doc1,
          commit: mergedCommit1,
          documentsScope,
        },
        commit2: {
          project,
          document: doc2,
          commit: mergedCommit2,
          documentsScope,
        },
        commit3: { project, document: doc3, commit: commit3, documentsScope },
      }
    })

    it('get docs from commit 1', async () => {
      const { commit, documentsScope } = documentsByContent.commit1!
      const documents = await documentsScope
        .getDocumentsAtCommit(commit)
        .then((r) => r.unwrap())

      const contents = documents
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((d) => d.content)
      expect(contents[0]).toContain('Doc_1_commit_1')
    })

    it('get docs from commit 2', async () => {
      const { documentsScope, commit } = documentsByContent.commit2!
      const documents = await documentsScope
        .getDocumentsAtCommit(commit)
        .then((r) => r.unwrap())

      const contents = documents
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((d) => d.content)
      expect(contents[0]).toContain('Doc_1_commit_1')
      expect(contents[1]).toContain('Doc_2_commit_2')
    })

    it('get docs from commit 3', async () => {
      const { documentsScope, commit } = documentsByContent.commit3!
      const documents = await documentsScope
        .getDocumentsAtCommit(commit)
        .then((r) => r.unwrap())

      const contents = documents
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((d) => d.content)
      expect(contents[0]).toContain('Doc_1_commit_1')
      expect(contents[1]).toContain('Doc_2_commit_3_draft')
    })

    it('get docs from HEAD', async () => {
      const { project, documentsScope } = documentsByContent.commit1!
      const commitsScope = new CommitsRepository(project.workspaceId)
      const commit = await commitsScope
        .getCommitByUuid({
          projectId: project.id,
          uuid: HEAD_COMMIT,
        })
        .then((r) => r.unwrap())
      const documents = await documentsScope
        .getDocumentsAtCommit(commit)
        .then((r) => r.unwrap())

      const contents = documents
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((d) => d.content)
      expect(contents[0]).toContain('Doc_1_commit_1')
      expect(contents[1]).toContain('Doc_2_commit_2')
    })
  })
})
