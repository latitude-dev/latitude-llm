import {
  Commit,
  DocumentVersion,
  ModifiedDocumentType,
  Project,
} from '$core/browser'
import { destroyDocument, factories, updateDocument } from '$core/index'
import { CommitsRepository } from '$core/repositories/commitsRepository'
import { beforeEach, describe, expect, it } from 'vitest'

let project: Project
let commit: Commit
let draftCommit: Commit
let documents: Record<string, DocumentVersion>
let repo: CommitsRepository
describe('publishDraftCommit', () => {
  beforeEach(async () => {
    const {
      project: prj,
      commit: cmt,
      user,
      documents: docs,
    } = await factories.createProject({
      documents: {
        folder1: {
          doc1: 'content1',
        },
        doc2: 'content2',
      },
    })
    project = prj
    commit = cmt
    const { commit: draft } = await factories.createDraft({ project, user })
    draftCommit = draft
    documents = docs.reduce(
      (acc, doc) => {
        acc[doc.path] = doc
        return acc
      },
      {} as Record<string, DocumentVersion>,
    )
    repo = new CommitsRepository(project.workspaceId)
  })

  it('fails if commit is not found', async () => {
    const result = await repo.getChanges(9999)
    expect(result.error).toBeTruthy()
  })

  it('fails if commit is merged', async () => {
    const result = await repo.getChanges(commit.id)
    expect(result.error).toBeTruthy()
  })

  it('show changed documents', async () => {
    await updateDocument({
      document: documents['folder1/doc1']!,
      content: 'content1.1',
      commit: draftCommit,
    }).then((r) => r.unwrap())

    const changes = await repo
      .getChanges(draftCommit.id)
      .then((r) => r.unwrap())

    expect(changes).toEqual([
      {
        documentUuid: documents['folder1/doc1']!.documentUuid,
        path: 'folder1/doc1',
        changeType: ModifiedDocumentType.Updated,
        errors: 0,
      },
    ])
  })

  it('show created documents', async () => {
    const { documentVersion: newDoc } = await factories.createDocumentVersion({
      commit: draftCommit,
      path: 'folder1/doc3',
      content: 'content3',
    })

    const changes = await repo
      .getChanges(draftCommit.id)
      .then((r) => r.unwrap())

    expect(changes).toEqual([
      {
        documentUuid: newDoc.documentUuid,
        path: 'folder1/doc3',
        changeType: ModifiedDocumentType.Created,
        errors: 0,
      },
    ])
  })

  it('show deleted documents', async () => {
    await destroyDocument({
      document: documents['folder1/doc1']!,
      commit: draftCommit,
    }).then((r) => r.unwrap())

    const changes = await repo
      .getChanges(draftCommit.id)
      .then((r) => r.unwrap())

    expect(changes).toEqual([
      {
        documentUuid: documents['folder1/doc1']!.documentUuid,
        path: 'folder1/doc1',
        changeType: ModifiedDocumentType.Deleted,
        errors: 0,
      },
    ])
  })

  it('show documents with number of errors sorted by errors', async () => {
    await updateDocument({
      document: documents['folder1/doc1']!,
      content: 'Content doc1 changed',
      commit: draftCommit,
    }).then((r) => r.unwrap())
    await updateDocument({
      document: documents['doc2']!,
      content: '<foo>WRONG</foo>',
      commit: draftCommit,
    }).then((r) => r.unwrap())

    const changes = await repo
      .getChanges(draftCommit.id)
      .then((r) => r.unwrap())

    expect(changes).toEqual([
      {
        documentUuid: documents['doc2']!.documentUuid,
        path: 'doc2',
        changeType: ModifiedDocumentType.Updated,
        errors: 1,
      },
      {
        documentUuid: documents['folder1/doc1']!.documentUuid,
        path: 'folder1/doc1',
        changeType: ModifiedDocumentType.Updated,
        errors: 0,
      },
    ])
  })
})
