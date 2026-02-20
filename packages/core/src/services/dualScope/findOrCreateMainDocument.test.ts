import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_MAIN_DOCUMENT } from '@latitude-data/constants/dualScope'
import { ConflictError } from '@latitude-data/constants/errors'
import { Providers } from '@latitude-data/constants'

import { DocumentVersionsRepository } from '../../repositories'
import { Result } from '../../lib/Result'
import { Commit } from '../../schema/models/types/Commit'
import { Project } from '../../schema/models/types/Project'
import { User } from '../../schema/models/types/User'
import { Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { mergeCommit } from '../commits/merge'
import { findOrCreateMainDocument } from './findOrCreateMainDocument'

describe('findOrCreateMainDocument', () => {
  let user: User
  let workspace: Workspace
  let project: Project
  let commit: Commit

  beforeEach(async () => {
    const setup = await factories.createProject({
      providers: [],
      skipMerge: true,
    })
    user = setup.user
    workspace = setup.workspace
    project = setup.project
    commit = setup.commit
  })

  it('creates the main document when it does not exist', async () => {
    const result = await findOrCreateMainDocument({
      workspace,
      project,
      user,
    })

    expect(result.ok).toBe(true)
    const { document, commit: returnedCommit } = result.unwrap()

    expect(document.path).toBe(PROJECT_MAIN_DOCUMENT)
    expect(document.content).toBe('')
    expect(returnedCommit.id).toBe(commit.id)

    const docsRepo = new DocumentVersionsRepository(workspace.id)
    const docs = await docsRepo
      .getDocumentsAtCommit(commit)
      .then((r) => r.unwrap())
    const mainDoc = docs.find((d) => d.path === PROJECT_MAIN_DOCUMENT)
    expect(mainDoc).toBeDefined()
    expect(mainDoc!.documentUuid).toBe(document.documentUuid)
  })

  it('returns existing document when it already exists', async () => {
    const firstResult = await findOrCreateMainDocument({
      workspace,
      project,
      user,
    })
    const firstDocument = firstResult.unwrap().document

    const secondResult = await findOrCreateMainDocument({
      workspace,
      project,
      user,
    })

    expect(secondResult.ok).toBe(true)
    const { document: secondDocument } = secondResult.unwrap()
    expect(secondDocument.documentUuid).toBe(firstDocument.documentUuid)
    expect(secondDocument.path).toBe(PROJECT_MAIN_DOCUMENT)
  })

  it('fails when no draft commit exists (project has been merged)', async () => {
    const { project: mergedProject, workspace: ws } =
      await factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'test' }],
        documents: { 'test-doc': 'test content' },
      })

    const result = await findOrCreateMainDocument({
      workspace: ws,
      project: mergedProject,
      user,
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('No draft commit found')
  })

  it('handles concurrent creation by returning existing document on ConflictError', async () => {
    const createNewDocumentModule = await import('../documents')
    const originalCreateNewDocument = createNewDocumentModule.createNewDocument

    let callCount = 0
    const createNewDocumentSpy = vi.spyOn(
      createNewDocumentModule,
      'createNewDocument',
    )

    createNewDocumentSpy.mockImplementation(async (params, transaction) => {
      callCount++
      if (callCount === 1) {
        return originalCreateNewDocument(params, transaction)
      }
      return Result.error(
        new ConflictError('duplicate key value violates unique constraint'),
      )
    })

    const firstResult = await findOrCreateMainDocument({
      workspace,
      project,
      user,
    })
    expect(firstResult.ok).toBe(true)
    const firstDocument = firstResult.unwrap().document

    const secondResult = await findOrCreateMainDocument({
      workspace,
      project,
      user,
    })

    expect(secondResult.ok).toBe(true)
    const { document: secondDocument } = secondResult.unwrap()
    expect(secondDocument.documentUuid).toBe(firstDocument.documentUuid)

    createNewDocumentSpy.mockRestore()
  })

  it('propagates non-conflict errors from document creation', async () => {
    const {
      project: mergedProject,
      workspace: ws,
      commit: mergedCommit,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      skipMerge: true,
    })

    await mergeCommit(mergedCommit)

    const result = await findOrCreateMainDocument({
      workspace: ws,
      project: mergedProject,
      user,
    })

    expect(result.ok).toBe(false)
  })
})
