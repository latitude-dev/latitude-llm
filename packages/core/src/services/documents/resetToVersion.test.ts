import { describe, expect, it } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { DocumentVersionsRepository } from '../../repositories'
import { updateDocument } from './update'
import { mergeCommit } from '../commits'
import { resetToDocumentVersion } from './resetToVersion'
import { createNewDocument } from './create'

describe('resetDocumentToVersion', () => {
  it('removes all the changes made to a document from in-between commits', async (ctx) => {
    const { workspace, project, user, documents } =
      await ctx.factories.createProject({
        providers: [
          {
            type: Providers.OpenAI,
            name: 'openai',
          },
        ],
        documents: {
          doc1: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Doc 1 commit 1',
          }),
        },
      })

    const document = documents[0]!

    const { commit: commit1 } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: commit1,
      document,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'Doc 1 commit 2',
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(commit1).then((r) => r.unwrap())

    const { commit: commit2 } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: commit2,
      document,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'Doc 1 commit 3',
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(commit2).then((r) => r.unwrap())

    const { commit: draft } = await ctx.factories.createDraft({ project, user })
    const documentRepo = new DocumentVersionsRepository(workspace.id)
    const draftDocumentPreReset = await documentRepo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: draft.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    expect(
      draftDocumentPreReset.content.includes('Doc 1 commit 3'),
    ).toBeTruthy()

    await resetToDocumentVersion({
      workspace,
      documentVersion: document,
      draft,
    }).then((r) => r.unwrap())

    const draftDocumentPostReset = await documentRepo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: draft.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())
    expect(
      draftDocumentPostReset.content.includes('Doc 1 commit 1'),
    ).toBeTruthy()
  })

  it('returns removed documents back to life', async (ctx) => {
    const { workspace, project, user, documents } =
      await ctx.factories.createProject({
        providers: [
          {
            type: Providers.OpenAI,
            name: 'openai',
          },
        ],
        documents: {
          doc1: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Doc 1 commit 1',
          }),
        },
      })

    const document = documents[0]!

    const { commit: commit1 } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: commit1,
      document,
      deletedAt: new Date(),
    }).then((r) => r.unwrap())
    await mergeCommit(commit1).then((r) => r.unwrap())

    const documentRepo = new DocumentVersionsRepository(workspace.id)
    const commit1Docs = await documentRepo
      .getDocumentsAtCommit(commit1)
      .then((r) => r.unwrap())
    expect(commit1Docs.length).toBe(0)

    const { commit: draft } = await ctx.factories.createDraft({ project, user })
    await resetToDocumentVersion({
      workspace,
      documentVersion: document,
      draft,
    }).then((r) => r.unwrap())

    const draftDocs = await documentRepo
      .getDocumentsAtCommit(draft)
      .then((r) => r.unwrap())
    expect(draftDocs.length).toBe(1)
  })

  it('invalidates resolvedContents from the draft', async (ctx) => {
    const { workspace, project, user, documents } =
      await ctx.factories.createProject({
        providers: [
          {
            type: Providers.OpenAI,
            name: 'openai',
          },
        ],
        documents: {
          doc1: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Doc 1 commit 1',
          }),
          doc2: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Doc 2 commit 1',
          }),
        },
      })

    const [document1, document2] = documents

    const { commit: commit1 } = await ctx.factories.createDraft({
      project,
      user,
    })

    await updateDocument({
      commit: commit1,
      document: document1!,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'Doc 1 commit 2',
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(commit1).then((r) => r.unwrap())

    const documentRepo = new DocumentVersionsRepository(workspace.id)
    const commit1Docs = await documentRepo
      .getDocumentsAtCommit(commit1)
      .then((r) => r.unwrap())

    expect(commit1Docs.every((d) => d.resolvedContent !== null)).toBeTruthy()

    const { commit: draft } = await ctx.factories.createDraft({ project, user })
    await updateDocument({
      commit: draft,
      document: document2!,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'Doc 2 commit 3',
      }),
    }).then((r) => r.unwrap())
    await resetToDocumentVersion({
      workspace,
      documentVersion: document1!,
      draft,
    }).then((r) => r.unwrap())

    const draftDocs = await documentRepo
      .getDocumentsAtCommit(draft)
      .then((r) => r.unwrap())

    expect(draftDocs.every((d) => d.resolvedContent === null)).toBeTruthy()
  })

  it('fails if there are already files with the same path in the draft', async (ctx) => {
    const { workspace, project, user, documents } =
      await ctx.factories.createProject({
        providers: [
          {
            type: Providers.OpenAI,
            name: 'openai',
          },
        ],
        documents: {
          foo: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Original foo document',
          }),
        },
      })

    const originalDocument = documents[0]!

    const { commit: commit1 } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: commit1,
      document: originalDocument,
      deletedAt: new Date(),
    }).then((r) => r.unwrap())
    await mergeCommit(commit1).then((r) => r.unwrap())

    const { commit: commit2 } = await ctx.factories.createDraft({
      project,
      user,
    })
    await createNewDocument({
      workspace,
      user,
      commit: commit2,
      path: originalDocument.path,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'New foo document',
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(commit2).then((r) => r.unwrap())

    const { commit: draft } = await ctx.factories.createDraft({ project, user })
    const result = await resetToDocumentVersion({
      workspace,
      documentVersion: originalDocument,
      draft,
    })

    expect(result.error).toBeDefined()
  })
})
