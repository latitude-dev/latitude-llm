import { beforeEach, describe, expect, it } from 'vitest'

import { DocumentLogsWithMetadataAndErrorsRepository } from '.'
import { DocumentLog } from '../../constants'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { mergeCommit } from '../../services/commits'
import { updateDocument } from '../../services/documents'
import * as factories from '../../tests/factories'

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
})
