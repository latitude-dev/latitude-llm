import { beforeEach, describe, expect, it } from 'vitest'

import {
  Commit,
  DocumentVersion,
  ModifiedDocumentType,
  Project,
  Providers,
  User,
  Workspace,
} from '../../browser'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  helpers,
} from '../../tests/factories'
import { destroyDocument, updateDocument } from '../documents'
import { getCommitChanges } from './getChanges'
import { mergeCommit } from './merge'

let project: Project
let draftCommit: Commit
let documents: Record<string, DocumentVersion>
let workspace: Workspace
let user: User

describe('publishDraftCommit', () => {
  beforeEach(async () => {
    const {
      project: prj,
      user: usr,
      workspace: ws,
      documents: docs,
    } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        folder1: {
          doc1: helpers.createPrompt({
            provider: 'openai',
            content: 'content1',
          }),
        },
        doc2: helpers.createPrompt({ provider: 'openai', content: 'content2' }),
      },
    })
    workspace = ws
    user = usr
    project = prj
    const { commit: draft } = await createDraft({ project, user })
    draftCommit = draft
    documents = docs.reduce(
      (acc, doc) => {
        acc[doc.path] = doc
        return acc
      },
      {} as Record<string, DocumentVersion>,
    )
  })

  it('show changed documents', async () => {
    await updateDocument({
      document: documents['folder1/doc1']!,
      content: helpers.createPrompt({
        provider: 'openai',
        content: 'content1.1',
      }),
      commit: draftCommit,
    }).then((r) => r.unwrap())

    const changes = await getCommitChanges({
      commit: draftCommit,
      workspace,
    }).then((r) => r.unwrap())

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
    const { documentVersion: newDoc } = await createDocumentVersion({
      workspace: workspace,
      user: user,
      commit: draftCommit,
      path: 'folder1/doc3',
      content: helpers.createPrompt({
        provider: 'openai',
        content: 'content3',
      }),
    })

    const changes = await getCommitChanges({
      commit: draftCommit,
      workspace,
    }).then((r) => r.unwrap())

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
      workspace: workspace,
    }).then((r) => r.unwrap())

    const changes = await getCommitChanges({
      commit: draftCommit,
      workspace,
    }).then((r) => r.unwrap())

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
      content: helpers.createPrompt({
        provider: 'openai',
        content: 'Content doc1 changed',
      }),
      commit: draftCommit,
    }).then((r) => r.unwrap())
    await updateDocument({
      document: documents['doc2']!,
      content: helpers.createPrompt({
        provider: 'openai',
        content: '{{ WRONG ',
      }),
      commit: draftCommit,
    }).then((r) => r.unwrap())

    const changes = await getCommitChanges({
      commit: draftCommit,
      workspace,
    }).then((r) => r.unwrap())

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

  it('does not include errors from deleted documents', async () => {
    await updateDocument({
      document: documents['folder1/doc1']!,
      content: helpers.createPrompt({
        provider: 'openai',
        content: '<prompt path="../doc2" />',
      }),
      commit: draftCommit,
    }).then((r) => r.unwrap())

    await mergeCommit(draftCommit).then((r) => r.unwrap())

    const { commit: newCommit } = await createDraft({
      project: project,
      user: user,
    })

    // Renaming the doc2 will make the doc1 to contain errors
    await updateDocument({
      document: documents['doc2']!,
      path: 'new-doc2',
      commit: newCommit,
    }).then((r) => r.unwrap())

    // Now this doc contains errors, but we remove it anyways
    await destroyDocument({
      document: documents['folder1/doc1']!,
      commit: newCommit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    const changes = await getCommitChanges({
      commit: newCommit,
      workspace,
    }).then((r) => r.unwrap())

    // There should be no errors from deleted documents
    expect(changes).toEqual(
      expect.arrayContaining([
        {
          documentUuid: documents['doc2']!.documentUuid,
          path: 'new-doc2',
          changeType: ModifiedDocumentType.UpdatedPath,
          errors: 0,
        },
        {
          documentUuid: documents['folder1/doc1']!.documentUuid,
          path: 'folder1/doc1',
          changeType: ModifiedDocumentType.Deleted,
          errors: 0,
        },
      ]),
    )
  })
})
