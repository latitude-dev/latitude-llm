import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  Commit,
  DocumentLog,
  DocumentVersion,
  LOG_SOURCES,
  Project,
  ProviderApiKey,
  Providers,
  User,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { documentLogs } from '../../schema'
import { mergeCommit } from '../../services/commits'
import { updateDocument } from '../../services/documents'
import * as factories from '../../tests/factories'
import {
  computeDocumentLogsWithMetadataCount,
  computeDocumentLogsWithMetadataQuery,
} from './computeDocumentLogsWithMetadata'
import { parseSafeCreatedAtRange } from './logsFilterUtils'

async function updateLogCreatedAt(date: Date, log: DocumentLog) {
  const result = await database
    .update(documentLogs)
    .set({ createdAt: date })
    .where(eq(documentLogs.id, log.id))
    .returning()
  return result[0]!
}

describe('getDocumentLogsWithMetadata', () => {
  describe('merged commits', () => {
    let workspace: Workspace
    let user: User
    let doc: DocumentVersion
    let log1: DocumentLog
    let log2: DocumentLog
    let project: Project
    let commit: Commit
    let commit2: Commit
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

      const { commit: cmt2 } = await factories.createDraft({
        project,
        user: setup.user,
      })
      commit2 = cmt2
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
      const result = await computeDocumentLogsWithMetadataQuery({
        workspaceId: project.workspaceId,
        documentUuid: doc.documentUuid,
        filterOptions: {
          commitIds: [commit.id, commit2.id],
          logSources: LOG_SOURCES,
          createdAt: undefined,
          customIdentifier: undefined,
        },
      })

      expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
      expect(result.find((l) => l.uuid === log2.uuid)).toBeDefined()
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
      const result = await computeDocumentLogsWithMetadataQuery({
        workspaceId: project.workspaceId,
        filterOptions: {
          commitIds: [commit.id, commit2.id],
          logSources: LOG_SOURCES,
          createdAt: undefined,
          customIdentifier: undefined,
        },
      })

      expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
      expect(result.find((l) => l.uuid === log2.uuid)).toBeDefined()
      expect(result.find((l) => l.uuid === log3.uuid)).toBeDefined()
    })

    describe('filter logs by createdAt', () => {
      let anotherWorkspace: Workspace
      let anotherWorkspaceLog: DocumentLog
      let log3: DocumentLog
      let anotherCommit: Commit
      let log1Before: DocumentLog
      let log2Between: DocumentLog
      let log3InAfter: DocumentLog
      let anotherWorkspacelogBetween: DocumentLog

      beforeEach(async () => {
        const { workspace: anotherWp } = await factories.createWorkspace()
        anotherWorkspace = anotherWp

        const another = await factories.createProject({
          workspace: anotherWorkspace,
          providers: [
            {
              name: 'openai',
              type: Providers.OpenAI,
            },
          ],
          documents: {
            foo: factories.helpers.createPrompt({
              provider: 'openai',
            }),
          },
        })
        anotherCommit = another.commit
        const { documentVersion: doc2 } = await factories.createDocumentVersion(
          {
            workspace,
            user,
            commit,
            path: 'folder1/doc2',
            content: factories.helpers.createPrompt({
              provider,
              content: 'DOC_2_VERSION_1',
            }),
          },
        )
        const { documentLog: lg3 } = await factories.createDocumentLog({
          document: doc2,
          commit,
        })
        log3 = lg3

        const { documentLog: awlog } = await factories.createDocumentLog({
          document: another.documents[0]!,
          commit: another.commit,
        })

        anotherWorkspaceLog = awlog
        log1Before = await updateLogCreatedAt(
          new Date('2024-12-10T22:59:59Z'),
          log1,
        )
        log2Between = await updateLogCreatedAt(
          new Date('2024-12-10T23:00:01Z'),
          log2,
        )
        anotherWorkspacelogBetween = await updateLogCreatedAt(
          new Date('2024-12-10T23:00:01Z'),
          anotherWorkspaceLog,
        )
        log3InAfter = await updateLogCreatedAt(
          new Date('2024-12-11T23:00:01Z'),
          log3,
        )
      })

      it('filter logs by createdAt', async () => {
        // We pass datetimes with timezone offset to ensure that the function
        const createdAt = parseSafeCreatedAtRange(
          '2024-12-11T00:00:00 01:00,2024-12-11T23:59:59 01:00',
        )
        const result = await computeDocumentLogsWithMetadataQuery({
          workspaceId: workspace.id,
          filterOptions: {
            commitIds: [commit.id, commit2.id, anotherCommit.id],
            logSources: LOG_SOURCES,
            createdAt,
            customIdentifier: undefined,
          },
        })

        expect(result.length).toBe(1)
        expect(result.find((l) => l.uuid === log1Before.uuid)).toBeUndefined()
        expect(result.find((l) => l.uuid === log2Between.uuid)).toBeDefined()
        expect(
          result.find((l) => l.uuid === anotherWorkspacelogBetween.uuid),
        ).toBeUndefined()
        expect(result.find((l) => l.uuid === log3InAfter.uuid)).toBeUndefined()
      })

      it('filter logs by createdAt only with from', async () => {
        const createdAt = parseSafeCreatedAtRange('2024-12-11T00:00:00 01:00')
        const result = await computeDocumentLogsWithMetadataQuery({
          workspaceId: workspace.id,
          filterOptions: {
            commitIds: [commit.id, commit2.id, anotherCommit.id],
            logSources: LOG_SOURCES,
            createdAt,
            customIdentifier: undefined,
          },
        })

        expect(result.length).toBe(1)
        expect(result.find((l) => l.uuid === log1Before.uuid)).toBeUndefined()
        expect(result.find((l) => l.uuid === log2Between.uuid)).toBeDefined()
        expect(
          result.find((l) => l.uuid === anotherWorkspacelogBetween.uuid),
        ).toBeUndefined()
        expect(result.find((l) => l.uuid === log3InAfter.uuid)).toBeUndefined()
      })
    })

    it('paginate logs', async () => {
      const result = await computeDocumentLogsWithMetadataQuery({
        workspaceId: project.workspaceId,
        documentUuid: doc.documentUuid,
        filterOptions: {
          commitIds: [commit.id, commit2.id],
          logSources: LOG_SOURCES,
          createdAt: undefined,
          customIdentifier: undefined,
        },
        page: '1',
        pageSize: '1',
      })
      expect(result.length).toBe(1)
    })

    it('count logs', async () => {
      const result = await computeDocumentLogsWithMetadataCount({
        workspaceId: project.workspaceId,
        documentUuid: doc.documentUuid,
        filterOptions: {
          commitIds: [commit.id, commit2.id],
          logSources: LOG_SOURCES,
          createdAt: undefined,
          customIdentifier: undefined,
        },
      })

      expect(result).toBe(2)
    })
  })

  it('includes logs from specified draft', async () => {
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

    const { commit: commit2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: commit2,
      document: doc,
      path: 'folder1/doc1',
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_2',
      }),
    })
    await mergeCommit(commit2).then((r) => r.unwrap())

    const { commit: draft } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft,
      document: doc,
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_3',
      }),
    })

    const { documentLog: log1 } = await factories.createDocumentLog({
      document: doc,
      commit: commit1,
    })
    const { documentLog: log2 } = await factories.createDocumentLog({
      document: doc,
      commit: commit2,
    })
    const { documentLog: log3 } = await factories.createDocumentLog({
      document: doc,
      commit: draft,
    })

    const result = await computeDocumentLogsWithMetadataQuery({
      workspaceId: project.workspaceId,
      documentUuid: doc.documentUuid,
      filterOptions: {
        commitIds: [commit1.id, commit2.id, draft.id],
        logSources: LOG_SOURCES,
        createdAt: undefined,
        customIdentifier: undefined,
      },
    })

    expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log2.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log3.uuid)).toBeDefined()
  })

  it('does not include logs from non-specified drafts', async () => {
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

    const { commit: draft1 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft1,
      document: doc,
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_2',
      }),
    })

    const { commit: draft2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft2,
      document: doc,
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_3',
      }),
    })

    const { documentLog: log1 } = await factories.createDocumentLog({
      document: doc,
      commit: commit1,
    })
    const { documentLog: log2 } = await factories.createDocumentLog({
      document: doc,
      commit: draft1,
    })
    const { documentLog: log3 } = await factories.createDocumentLog({
      document: doc,
      commit: draft2,
    })

    const result = await computeDocumentLogsWithMetadataQuery({
      workspaceId: project.workspaceId,
      documentUuid: doc.documentUuid,
      filterOptions: {
        commitIds: [commit1.id, draft1.id],
        logSources: LOG_SOURCES,
        createdAt: undefined,
        customIdentifier: undefined,
      },
    })

    expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log2.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log3.uuid)).not.toBeDefined()
  })

  it('includes logs from specified custom identifier', async () => {
    const { project, user, workspace, providers } =
      await factories.createProject()
    const { commit } = await factories.createDraft({ project, user })
    const { documentVersion: document } = await factories.createDocumentVersion(
      {
        workspace,
        user,
        commit,
        path: 'folder1/doc1',
        content: factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'VERSION_1',
        }),
      },
    )

    const { documentLog: log1 } = await factories.createDocumentLog({
      document,
      commit,
      customIdentifier: '31',
    })
    const { documentLog: log2 } = await factories.createDocumentLog({
      document,
      commit,
      customIdentifier: '31',
    })
    const { documentLog: log3 } = await factories.createDocumentLog({
      document,
      commit,
      customIdentifier: '32',
    })
    const { documentLog: log4 } = await factories.createDocumentLog({
      document,
      commit,
    })

    const result = await computeDocumentLogsWithMetadataQuery({
      workspaceId: project.workspaceId,
      documentUuid: document.documentUuid,
      filterOptions: {
        commitIds: [commit.id],
        logSources: LOG_SOURCES,
        createdAt: undefined,
        customIdentifier: '31',
      },
    })

    expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log2.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log3.uuid)).not.toBeDefined()
    expect(result.find((l) => l.uuid === log4.uuid)).not.toBeDefined()
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

    const result = await computeDocumentLogsWithMetadataQuery({
      workspaceId: project.workspaceId,
      documentUuid: doc.documentUuid,
      filterOptions: {
        commitIds: [commit.id],
        logSources: LOG_SOURCES,
        createdAt: undefined,
        customIdentifier: undefined,
      },
    })

    expect(result.find((l) => l.uuid === log.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log.uuid)?.tokens).toBeTypeOf('number')
    expect(
      result.find((l) => l.uuid === log.uuid)?.costInMillicents,
    ).toBeTypeOf('number')
  })

  it('does not include logs from non-specified log source', async () => {
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
    await factories.createDocumentLog({
      document: doc,
      commit,
    })

    const result = await computeDocumentLogsWithMetadataQuery({
      workspaceId: project.workspaceId,
      documentUuid: doc.documentUuid,
      filterOptions: {
        commitIds: [commit.id],
        logSources: [],
        createdAt: undefined,
        customIdentifier: undefined,
      },
    })

    expect(result.length).toBe(0)
  })

  it('returns logs without provider logs', async () => {
    const {
      project,
      user,
      workspace,
      providers,
      commit: commit0,
    } = await factories.createProject()
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

    const result = await computeDocumentLogsWithMetadataQuery({
      workspaceId: project.workspaceId,
      documentUuid: doc.documentUuid,
      filterOptions: {
        commitIds: [commit0.id, commit1.id],
        logSources: LOG_SOURCES,
        createdAt: undefined,
        customIdentifier: undefined,
      },
    })

    expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
  })
})
