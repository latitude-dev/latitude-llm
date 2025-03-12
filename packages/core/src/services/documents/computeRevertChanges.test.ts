import { describe, expect, it } from 'vitest'

import { Providers } from '../../constants'
import { DocumentVersionsRepository } from '../../repositories'
import { updateDocument } from './update'
import { mergeCommit } from '../commits'
import { computeDocumentRevertChanges } from './computeRevertChanges'
import { createNewDocument } from './create'

describe('computeDocumentRevertChanges', () => {
  it('reverts path changes', async (ctx) => {
    const {
      workspace,
      project,
      user,
      documents,
      commit: originalCommit,
    } = await ctx.factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        foo: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'CONTENT',
        }),
      },
    })

    const document = documents[0]!

    const { commit: changeCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: changeCommit,
      document,
      path: 'bar',
    }).then((r) => r.unwrap())
    await mergeCommit(changeCommit).then((r) => r.unwrap())

    const docsRepo = new DocumentVersionsRepository(workspace.id)
    const originalDocument = await docsRepo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: originalCommit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    const changedDocument = await docsRepo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: changeCommit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const revertChanges = await computeDocumentRevertChanges({
      workspace,
      originalDocument,
      changedDocument,
      draft,
    }).then((r) => r.unwrap())

    expect(revertChanges).toEqual({
      documentUuid: document.documentUuid,
      path: 'foo',
    })
  })

  it('reverts prompt deletion', async (ctx) => {
    const {
      workspace,
      project,
      user,
      documents,
      commit: originalCommit,
    } = await ctx.factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        foo: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'CONTENT',
        }),
      },
    })

    const document = documents[0]!

    const { commit: changeCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: changeCommit,
      document,
      deletedAt: new Date(),
    }).then((r) => r.unwrap())
    await mergeCommit(changeCommit).then((r) => r.unwrap())

    const docsRepo = new DocumentVersionsRepository(workspace.id)
    const originalDocument = await docsRepo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: originalCommit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    const changedDocument = await docsRepo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: changeCommit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const revertChanges = await computeDocumentRevertChanges({
      workspace,
      originalDocument,
      changedDocument,
      draft,
    }).then((r) => r.unwrap())

    expect(revertChanges).toEqual({
      documentUuid: document.documentUuid,
      deletedAt: null,
    })
  })

  it('reverts prompt creation', async (ctx) => {
    const {
      workspace,
      project,
      user,
      commit: originalCommit,
    } = await ctx.factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
    })

    const { commit: changeCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    const document = await createNewDocument({
      workspace,
      user,
      commit: changeCommit,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'CONTENT',
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(changeCommit).then((r) => r.unwrap())

    const docsRepo = new DocumentVersionsRepository(workspace.id)
    const originalCommitDocuments = await docsRepo
      .getDocumentsAtCommit(originalCommit)
      .then((r) => r.unwrap())
    const originalDocument = originalCommitDocuments.find(
      (d) => d.documentUuid === document.documentUuid,
    )

    const changedCommitDocuments = await docsRepo
      .getDocumentsAtCommit(changeCommit)
      .then((r) => r.unwrap())
    const changedDocument = changedCommitDocuments.find(
      (d) => d.documentUuid === document.documentUuid,
    )

    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const revertChanges = await computeDocumentRevertChanges({
      workspace,
      originalDocument,
      changedDocument,
      draft,
    }).then((r) => r.unwrap())

    expect(revertChanges).toEqual({
      documentUuid: document.documentUuid,
      deletedAt: expect.any(Date),
    })
  })

  it('only reverts changes in content present in the diff', async (ctx) => {
    const originalContent = `
1 OLD VALUE
2 OLD VALUE
3
4
`
    const newContent = `
1 OLD VALUE
2 NEW VALUE
3
4
`

    const currentContent = `
1 OLD VALUE
3
2 NEW VALUE
4
`

    const expectedRevertedContent = `
1 OLD VALUE
3
2 OLD VALUE
4
`

    // In these examples, the only change to be reverted is the change from "OLD VALUE" to "NEW VALUE" from the line starting with "2".
    // All other changes may have been made in other intermediate commits or the draft itself and must not be removed, like the reordering of these lines.

    const {
      workspace,
      project,
      user,
      documents,
      commit: originalCommit,
    } = await ctx.factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        foo: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: originalContent,
        }),
      },
    })

    const document = documents[0]!

    const { commit: changeCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: changeCommit,
      document,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: newContent,
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(changeCommit).then((r) => r.unwrap())

    const { commit: intermediateCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: intermediateCommit,
      document,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: currentContent,
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(intermediateCommit).then((r) => r.unwrap())

    const docsRepo = new DocumentVersionsRepository(workspace.id)
    const originalDocument = await docsRepo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: originalCommit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    const changedDocument = await docsRepo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: changeCommit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const revertChanges = await computeDocumentRevertChanges({
      workspace,
      originalDocument,
      changedDocument,
      draft,
    }).then((r) => r.unwrap())

    expect(revertChanges).toEqual({
      documentUuid: document.documentUuid,
      content: expect.stringContaining(expectedRevertedContent),
    })
  })

  it('fails if the document UUIDs do not match', async (ctx) => {
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
            content: 'Foo',
          }),
        },
      })

    const fooDocument = documents[0]!

    const { commit } = await ctx.factories.createDraft({
      project,
      user,
    })
    const barDocument = await createNewDocument({
      workspace,
      user,
      commit,
      path: 'bar',
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'Bar',
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(commit).then((r) => r.unwrap())

    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const result = await computeDocumentRevertChanges({
      workspace,
      originalDocument: fooDocument,
      changedDocument: barDocument,
      draft,
    })

    expect(result.error).toBeDefined()
  })

  it('fails when comparing the same document version', async (ctx) => {
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
            content: 'Foo',
          }),
        },
      })

    const fooDocument = documents[0]!

    const { commit } = await ctx.factories.createDraft({
      project,
      user,
    })

    const result = await computeDocumentRevertChanges({
      workspace,
      originalDocument: fooDocument,
      changedDocument: fooDocument,
      draft: commit,
    })

    expect(result.error).toBeDefined()
  })

  it('fails when the document does not exist in the draft and the changes to revert do not include readding it', async (ctx) => {
    const {
      workspace,
      project,
      user,
      documents,
      commit: originalCommit,
    } = await ctx.factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        foo: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Foo',
        }),
      },
    })

    const document = documents[0]!

    const { commit: changeCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: changeCommit,
      document,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'Bar',
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(changeCommit).then((r) => r.unwrap())

    const { commit: intermediateCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: intermediateCommit,
      document,
      deletedAt: new Date(),
    }).then((r) => r.unwrap())
    await mergeCommit(intermediateCommit).then((r) => r.unwrap())

    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const docsRepo = new DocumentVersionsRepository(workspace.id)

    const originalDocument = await docsRepo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: originalCommit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    const changedDocument = await docsRepo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: changeCommit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    const result = await computeDocumentRevertChanges({
      workspace,
      originalDocument,
      changedDocument,
      draft,
    })

    expect(result.error).toBeDefined()
  })
})
