import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { DocumentLogsWithMetadataAndErrorsRepository } from '.'
import {
  Commit,
  DocumentLog,
  DocumentVersion,
  LogSources,
  Project,
  ProviderApiKey,
  Providers,
  User,
  Workspace,
} from '../../browser'
import { mergeCommit } from '../../services/commits'
import { updateDocument } from '../../services/documents'
import * as factories from '../../tests/factories'
import { FactoryCreateProjectReturn } from '../../tests/factories'

describe('getDocumentLogsWithMetadata', () => {
  describe('logs from merged commits', () => {
    let workspace: Workspace
    let user: User
    let doc: DocumentVersion
    let log1: DocumentLog
    let log2: DocumentLog
    let project: Project
    let commit: Commit
    let provider: ProviderApiKey

    beforeEach(async () => {
      const setup = await factories.createProject()
      workspace = setup.workspace
      user = setup.user
      project = setup.project
      provider = setup.providers[0]!
      const { commit: commit1 } = await factories.createDraft({
        project,
        user: setup.user,
      })
      commit = commit1
      const { documentVersion: docVersion } =
        await factories.createDocumentVersion({
          workspace: setup.workspace,
          user: setup.user,
          commit: commit1,
          path: 'folder1/doc1',
          content: factories.helpers.createPrompt({
            provider,
            content: 'VERSION_1',
          }),
        })
      doc = docVersion
      await mergeCommit(commit1).then((r) => r.unwrap())

      const { commit: commit2 } = await factories.createDraft({
        project,
        user: setup.user,
      })
      await updateDocument({
        commit: commit2,
        document: doc,
        content: factories.helpers.createPrompt({
          provider,
          content: 'VERSION_2',
        }),
      })
      await mergeCommit(commit2).then((r) => r.unwrap())

      const { documentLog: docLog1 } = await factories.createDocumentLog({
        document: doc,
        commit: commit1,
      })
      log1 = docLog1
      const { documentLog: docLog2 } = await factories.createDocumentLog({
        document: doc,
        commit: commit2,
      })
      log2 = docLog2
    })

    it('return all logs from merged commits', async () => {
      const repo = new DocumentLogsWithMetadataAndErrorsRepository(
        project.workspaceId,
      )
      const foundLog1 = await repo.findByUuid(log1.uuid).then((r) => r.unwrap())
      const foundLog2 = await repo.findByUuid(log2.uuid).then((r) => r.unwrap())

      expect(foundLog1).toBeDefined()
      expect(foundLog2).toBeDefined()
    })

    it('return all logs from any document', async () => {
      const { documentVersion: doc2 } = await factories.createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'folder1/doc2',
        content: factories.helpers.createPrompt({
          provider,
          content: 'DOC_2_VERSION_1',
        }),
      })
      const { documentLog: log3 } = await factories.createDocumentLog({
        document: doc2,
        commit,
      })
      const repo = new DocumentLogsWithMetadataAndErrorsRepository(
        project.workspaceId,
      )
      const foundLog1 = await repo.findByUuid(log1.uuid).then((r) => r.unwrap())
      const foundLog2 = await repo.findByUuid(log2.uuid).then((r) => r.unwrap())
      const foundLog3 = await repo.findByUuid(log3.uuid).then((r) => r.unwrap())

      expect(foundLog1).toBeDefined()
      expect(foundLog2).toBeDefined()
      expect(foundLog3).toBeDefined()
    })

    it('returns a sum of tokens and cost', async () => {
      const { project, user, workspace, providers } =
        await factories.createProject()
      const { commit } = await factories.createDraft({ project, user })
      const { documentVersion: doc } = await factories.createDocumentVersion({
        workspace,
        user,
        commit,
        path: 'folder1/doc1',
        content: factories.helpers.createPrompt({
          provider: providers[0]!,
          content: '<response/>\n<response/>',
        }),
      })
      await mergeCommit(commit).then((r) => r.unwrap())

      const { documentLog: log } = await factories.createDocumentLog({
        document: doc,
        commit,
      })

      const repo = new DocumentLogsWithMetadataAndErrorsRepository(
        project.workspaceId,
      )
      const foundLog = await repo.findByUuid(log.uuid).then((r) => r.unwrap())

      expect(foundLog).toBeDefined()
      expect(foundLog?.tokens).toBeTypeOf('number')
      expect(foundLog?.costInMillicents).toBeTypeOf('number')
    })

    it('returns logs without provider logs', async () => {
      const { project, user, workspace, providers } =
        await factories.createProject()
      const { commit: commit1 } = await factories.createDraft({ project, user })
      const { documentVersion: doc } = await factories.createDocumentVersion({
        workspace,
        user,
        commit: commit1,
        path: 'folder1/doc1',
        content: factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'VERSION_1',
        }),
      })
      await mergeCommit(commit1).then((r) => r.unwrap())

      const { documentLog: log1 } = await factories.createDocumentLog({
        document: doc,
        commit: commit1,
        skipProviderLogs: true,
      })

      const repo = new DocumentLogsWithMetadataAndErrorsRepository(
        project.workspaceId,
      )
      const log = await repo.findByUuid(log1.uuid).then((r) => r.unwrap())

      expect(log).toBeDefined()
    })
  })

  describe('findInDocument', () => {
    let setup: FactoryCreateProjectReturn
    let document: DocumentVersion
    let repo: DocumentLogsWithMetadataAndErrorsRepository
    let logs: DocumentLog[]

    beforeAll(async () => {
      setup = await factories.createProject({
        providers: [
          {
            name: 'openai',
            type: Providers.OpenAI,
          },
        ],
        documents: {
          content: factories.helpers.createPrompt({
            provider: 'openai',
            model: 'gpt-4o',
          }),
        },
      })
      document = setup.documents[0]!

      logs = []
      for (let i = 0; i < 5; i++) {
        const documentLog =
          await factories.createDocumentLogWithMetadataAndError({
            document,
            commit: setup.commit,
            createdAt: new Date(Date.now() - i * 1000),
          })
        logs.push(documentLog)
      }

      repo = new DocumentLogsWithMetadataAndErrorsRepository(setup.workspace.id)
    })

    describe('paginated', () => {
      it('returns paginated logs for the first page', async () => {
        const result = await repo
          .findInDocumentPaginated({
            documentUuid: document.documentUuid,
            page: 1,
            size: 2,
          })
          .then((r) => r.unwrap())
        expect(result).toStrictEqual([logs[0], logs[1]])
      })

      it('returns remaining logs for the last page', async () => {
        const result = await repo
          .findInDocumentPaginated({
            documentUuid: document.documentUuid,
            page: 3,
            size: 2,
          })
          .then((r) => r.unwrap())
        expect(result).toStrictEqual([logs[4]])
      })

      it('returns empty array if page is out of range', async () => {
        const result = await repo
          .findInDocumentPaginated({
            documentUuid: document.documentUuid,
            page: 10,
            size: 2,
          })
          .then((r) => r.unwrap())
        expect(result.length).toBe(0)
      })

      it('applies extendedFilterOptions if provided', async () => {
        const result = await repo
          .findInDocumentPaginated({
            documentUuid: document.documentUuid,
            page: 1,
            size: 2,
            extendedFilterOptions: {
              commitIds: [setup.commit.id],
              logSources: Object.values(LogSources),
              excludedDocumentLogIds: [logs[0]!.id, logs[1]!.id],
            },
          })
          .then((r) => r.unwrap())
        expect(result).toStrictEqual([logs[2], logs[3]])
      })
    })

    describe('withCursor', () => {
      it('returns all logs if limit is large', async () => {
        const cursor = new Date()
        const result = await repo
          .findInDocumentWithCursor({
            documentUuid: document.documentUuid,
            limit: 10,
            cursor,
          })
          .then((r) => r.unwrap())
        expect(result.logs.length).toBe(5)
        expect(result.nextCursor).toBeUndefined()
      })

      it('returns logs after the cursor and undefined next cursor', async () => {
        const cursor = logs[2]!.createdAt
        const result = await repo
          .findInDocumentWithCursor({
            documentUuid: document.documentUuid,
            limit: 10,
            cursor,
          })
          .then((r) => r.unwrap())
        expect(result.logs).toStrictEqual([logs[3], logs[4]])
        expect(result.nextCursor).toBeUndefined()
      })

      it('returns at most the limit and sets nextCursor if more logs exist', async () => {
        const result = await repo
          .findInDocumentWithCursor({
            documentUuid: document.documentUuid,
            limit: 2,
          })
          .then((r) => r.unwrap())
        expect(result.logs.length).toStrictEqual(2)
        expect(result.nextCursor?.getTime()).toBe(logs[1]!.createdAt.getTime())
      })

      it('returns empty logs if no logs after cursor', async () => {
        const oldCursor = new Date(0)
        const result = await repo
          .findInDocumentWithCursor({
            documentUuid: document.documentUuid,
            limit: 10,
            cursor: oldCursor,
          })
          .then((r) => r.unwrap())
        expect(result.logs.length).toBe(0)
        expect(result.nextCursor).toBeUndefined()
      })

      it('applies extendedFilterOptions if provided', async () => {
        const cursor = new Date()
        const result = await repo
          .findInDocumentWithCursor({
            documentUuid: document.documentUuid,
            limit: 10,
            cursor,
            extendedFilterOptions: {
              commitIds: [setup.commit.id],
              logSources: Object.values(LogSources),
              documentLogIds: [logs[0]!.id],
            },
          })
          .then((r) => r.unwrap())
        expect(result.logs).toStrictEqual([logs[0]])
        expect(result.nextCursor).toBeUndefined()
      })
    })
  })
})
