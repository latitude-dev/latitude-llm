import { describe, expect, it } from 'vitest'

import { Providers } from '../../constants'
import { createNewDocument } from '../documents/create'
import { updateDocument } from '../documents/update'
import { computeChangesToRevertCommit } from './computeRevertChanges'
import { mergeCommit } from './merge'

describe('computeChangesToRevertCommit', () => {
  it('reverts path changes between commits', async (ctx) => {
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

    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    const revertChanges = await computeChangesToRevertCommit({
      workspace,
      originalCommit,
      changedCommit: changeCommit,
      targetDraft: draftCommit,
    }).then((r) => r.unwrap())

    expect(revertChanges).toEqual([
      {
        documentUuid: document.documentUuid,
        path: 'foo',
      },
    ])
  })

  it('reverts document deletions between commits', async (ctx) => {
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

    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    const revertChanges = await computeChangesToRevertCommit({
      workspace,
      originalCommit,
      changedCommit: changeCommit,
      targetDraft: draftCommit,
    }).then((r) => r.unwrap())

    expect(revertChanges).toEqual([
      {
        documentUuid: document.documentUuid,
        deletedAt: null,
      },
    ])
  })

  it('reverts document creations between commits', async (ctx) => {
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

    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    const revertChanges = await computeChangesToRevertCommit({
      workspace,
      originalCommit,
      changedCommit: changeCommit,
      targetDraft: draftCommit,
    }).then((r) => r.unwrap())

    expect(revertChanges).toEqual([
      {
        documentUuid: document.documentUuid,
        deletedAt: expect.any(Date),
      },
    ])
  })

  it('fails if commits are the same', async (ctx) => {
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

    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    const result = await computeChangesToRevertCommit({
      workspace,
      originalCommit,
      changedCommit: originalCommit,
      targetDraft: draftCommit,
    })

    expect(result.error).toBeDefined()
  })

  it('handles partial content changes gracefully', async (ctx) => {
    const originalContent = `
1 ORIGINAL LINE
2 ORIGINAL LINE
3
`

    const changedContent = `
1 MODIFIED LINE
2 ORIGINAL LINE
3
`

    const currentContent = `
2 ORIGINAL LINE
1 MODIFIED LINE
3
`

    const expectedRevertedContent = `
2 ORIGINAL LINE
1 ORIGINAL LINE
3
`

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

    const { commit: changedCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: changedCommit,
      document,
      content: document.content.replace(originalContent, changedContent),
    }).then((r) => r.unwrap())
    await mergeCommit(changedCommit).then((r) => r.unwrap())

    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    await updateDocument({
      commit: draftCommit,
      document,
      content: document.content.replace(originalContent, currentContent),
    }).then((r) => r.unwrap())

    const revertChanges = await computeChangesToRevertCommit({
      workspace,
      originalCommit,
      changedCommit: changedCommit,
      targetDraft: draftCommit,
    }).then((r) => r.unwrap())

    expect(revertChanges).toEqual([
      {
        documentUuid: document.documentUuid,
        content: document.content.replace(
          originalContent,
          expectedRevertedContent,
        ),
      },
    ])
  })

  it('reverts multiple changes between commits', async (ctx) => {
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
          content: 'Foo content',
        }),
        bar: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Bar content',
        }),
      },
    })

    const fooDocument = documents.find((doc) => doc.path === 'foo')!
    const barDocument = documents.find((doc) => doc.path === 'bar')!

    const { commit: changeCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    // Update the path of fooDocument and delete barDocument
    await updateDocument({
      commit: changeCommit,
      document: fooDocument!,
      path: 'new-foo-path',
    }).then((r) => r.unwrap())

    await updateDocument({
      commit: changeCommit,
      document: barDocument!,
      deletedAt: new Date(),
    }).then((r) => r.unwrap())

    await mergeCommit(changeCommit).then((r) => r.unwrap())

    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    const revertChanges = await computeChangesToRevertCommit({
      workspace,
      originalCommit,
      changedCommit: changeCommit,
      targetDraft: draftCommit,
    }).then((r) => r.unwrap())

    expect(revertChanges).toEqual(
      expect.arrayContaining([
        {
          documentUuid: fooDocument!.documentUuid,
          path: 'foo',
        },
        {
          documentUuid: barDocument!.documentUuid,
          deletedAt: null,
        },
      ]),
    )
  })

  it('does not revert unchanged documents', async (ctx) => {
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
        unchanged: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Unchanged content',
        }),
        changed: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Changed content',
        }),
      },
    })

    const unchangedDocument = documents.find((d) => d.path === 'unchanged')!
    const changedDocument = documents.find((d) => d.path === 'changed')!

    const { commit: changeCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    // Modify the content of the changed document
    await updateDocument({
      commit: changeCommit,
      document: changedDocument!,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'Updated content',
      }),
    }).then((r) => r.unwrap())

    await mergeCommit(changeCommit).then((r) => r.unwrap())

    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    const revertChanges = await computeChangesToRevertCommit({
      workspace,
      originalCommit,
      changedCommit: changeCommit,
      targetDraft: draftCommit,
    }).then((r) => r.unwrap())

    expect(revertChanges).toEqual([
      {
        documentUuid: changedDocument!.documentUuid,
        content: expect.stringContaining('Changed content'),
      },
    ])

    // Ensure unchangedDocument is not included
    const unchangedRevert = revertChanges.find(
      (change) => change.documentUuid === unchangedDocument!.documentUuid,
    )
    expect(unchangedRevert).toBeUndefined()
  })
})
