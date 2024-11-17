import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { ProviderApiKey, User, Workspace } from '../browser'
import { database } from '../client'
import { Providers } from '../constants'
import { documentVersions } from '../schema'
import { mergeCommit } from '../services/commits'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  createProviderApiKey,
  createWorkspace,
  destroyDocumentVersion,
  helpers,
  updateDocumentVersion,
} from '../tests/factories'
import { ProjectsRepository } from './projectsRepository'

describe('ProjectsRepository', async () => {
  let repository: ProjectsRepository
  let workspace: Workspace
  let user: User
  let provider: ProviderApiKey

  beforeEach(async () => {
    const { workspace: w, userData: u } = await createWorkspace()
    workspace = w
    user = u
    provider = await createProviderApiKey({
      workspace,
      type: Providers.OpenAI,
      name: 'OpenAI',
      user,
    })
    repository = new ProjectsRepository(workspace.id)
  })

  describe('findAllActiveWithAgreggatedData', () => {
    it('returns active projects ordered by lastEditedAt and createdAt', async () => {
      // When there are no projects
      let result = await repository.findAllActiveWithAgreggatedData()

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([])

      // After creating project0 and project1
      let { project: project0, commit: commit0 } = await createProject({
        name: 'project0',
        workspace,
        documents: {},
        skipMerge: true,
      })
      let { project: project1, commit: commit1 } = await createProject({
        name: 'project1',
        workspace,
        documents: {},
        skipMerge: true,
      })

      result = await repository.findAllActiveWithAgreggatedData()

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([
        { ...project1, lastEditedAt: null },
        { ...project0, lastEditedAt: null },
      ])

      // After adding a document to project1 and modifying it
      let { documentVersion: document1 } = await createDocumentVersion({
        workspace,
        user,
        commit: commit1,
        path: 'document1',
        content: helpers.createPrompt({ provider, content: 'content1' }),
      })
      document1 = await updateDocumentVersion({
        document: document1,
        commit: commit1,
        content: helpers.createPrompt({ provider, content: 'newContent1' }),
      })

      result = await repository.findAllActiveWithAgreggatedData()

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([
        { ...project1, lastEditedAt: document1.updatedAt },
        { ...project0, lastEditedAt: null },
      ])

      // After publishing project1 and adding a document to project0
      commit1 = await mergeCommit(commit1).then((r) => r.unwrap())
      document1 = await database
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentUuid, document1.documentUuid),
            eq(documentVersions.commitId, commit1.id),
          ),
        )
        .then((d) => d[0]!)
      let { documentVersion: document0 } = await createDocumentVersion({
        workspace,
        user,
        commit: commit0,
        path: 'document0',
        content: helpers.createPrompt({ provider, content: 'content0' }),
      })

      result = await repository.findAllActiveWithAgreggatedData()

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([
        { ...project0, lastEditedAt: document0.updatedAt },
        { ...project1, lastEditedAt: document1.updatedAt },
      ])

      // After creating project2 and deleting a document from project1
      commit1 = await createDraft({ project: project1, user }).then(
        (c) => c.commit,
      )
      let { project: project2 } = await createProject({
        name: 'project2',
        workspace,
        documents: {},
        skipMerge: true,
      })
      document1 = await destroyDocumentVersion({
        document: document1,
        commit: commit1,
      }).then((d) => d!)

      result = await repository.findAllActiveWithAgreggatedData()

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([
        { ...project1, lastEditedAt: document1.updatedAt },
        { ...project2, lastEditedAt: null },
        { ...project0, lastEditedAt: document0.updatedAt },
      ])

      // After creating project3 and deleting it
      await createProject({
        name: 'project3',
        workspace,
        deletedAt: new Date(),
      })

      result = await repository.findAllActiveWithAgreggatedData()

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([
        { ...project1, lastEditedAt: document1.updatedAt },
        { ...project2, lastEditedAt: null },
        { ...project0, lastEditedAt: document0.updatedAt },
      ])
    })
  })
})
