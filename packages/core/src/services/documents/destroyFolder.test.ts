import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { database } from '../../client'
import { Providers } from '../../constants'
import { NotFoundError } from '../../lib'
import { documentVersions } from '../../schema'
import * as factories from '../../tests/factories'
import { mergeCommit } from '../commits'
import { createNewDocument } from './create'
import { destroyFolder } from './destroyFolder'
import { updateDocument } from './update'

describe('removing folders', () => {
  it('throws error if folder does not exist', async () => {
    const { workspace, project, user } = await factories.createProject()
    const { commit: draft } = await factories.createDraft({ project, user })

    const result = await destroyFolder({
      path: 'some-folder',
      commit: draft,
      workspace: workspace,
    })
    expect(result.error).toEqual(new NotFoundError('Folder does not exist'))
  })

  it('throws error if commit is merged', async (ctx) => {
    const { project, user, workspace, providers } =
      await factories.createProject()
    const { commit: draft } = await factories.createDraft({ project, user })
    await createNewDocument({
      workspace,
      user,
      commit: draft,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'foo',
      }),
    })
    const mergedCommit = await mergeCommit(draft).then((r) => r.unwrap())

    const result = await destroyFolder({
      path: 'some-folder',
      commit: mergedCommit,
      workspace: workspace,
    })

    expect(result.error).toEqual(new Error('Cannot modify a merged commit'))
  })

  it('destroy folder that were in draft document but not in previous merged commits', async (ctx) => {
    const { project, user, workspace, providers } =
      await factories.createProject()
    const { commit: draft } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'root-folder/some-folder/doc1',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'Doc 1',
      }),
    })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'root-folder/some-folder/doc2',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'Doc 2',
      }),
    })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'root-folder/some-folder/inner-folder/doc42',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'Doc 42',
      }),
    })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'root-folder/other-nested-folder/doc3',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'Doc 3',
      }),
    })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'root-folder/some-foldernoisadoc',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'Doc 3',
      }),
    })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'other-foler/doc4',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'Doc 4',
      }),
    })

    await destroyFolder({
      path: 'root-folder/some-folder',
      commit: draft,
      workspace: workspace,
    }).then((r) => r.unwrap())

    const documents = await database.query.documentVersions.findMany({
      where: eq(documentVersions.commitId, draft.id),
    })

    expect(documents.length).toBe(3)
    const paths = documents.map((d) => d.path).sort()
    expect(paths).toEqual([
      'other-foler/doc4',
      'root-folder/other-nested-folder/doc3',
      'root-folder/some-foldernoisadoc',
    ])
  })

  it('create soft deleted documents that were present in merged commits and were deleted in this draft commit', async (ctx) => {
    const { workspace, project, user } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'some-folder': {
          doc2: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Doc 2',
          }),
          doc1: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Doc 1',
          }),
        },
      },
    })
    const { commit: draft } = await factories.createDraft({ project, user })

    await destroyFolder({
      path: 'some-folder',
      commit: draft,
      workspace: workspace,
    }).then((r) => r.unwrap())

    const documents = await database.query.documentVersions.findMany({
      where: and(eq(documentVersions.commitId, draft.id)),
    })

    const drafDocuments = documents.filter((d) => d.commitId === draft.id)
    expect(drafDocuments.length).toBe(2)
    const paths = drafDocuments.map((d) => d.path).sort()
    const deletedAt = drafDocuments.map((d) => d.deletedAt).filter(Boolean)
    expect(deletedAt.length).toBe(2)
    expect(paths).toEqual(['some-folder/doc1', 'some-folder/doc2'])
  })

  it('existing documents in this commit draft are marked as deleted', async (ctx) => {
    const { workspace, project, user, documents } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'some-folder': {
          doc2: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Doc 2',
          }),
          doc1: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'Doc 1',
          }),
        },
      },
    })
    const { commit: draft } = await factories.createDraft({ project, user })
    await Promise.all(
      documents.map((d) =>
        updateDocument({
          commit: draft,
          document: d,
          content: `${d.content} (version 2)`,
        }).then((r) => r.unwrap()),
      ),
    )

    // Fake cached content exists to prove the method invalidate cache
    await database
      .update(documentVersions)
      .set({
        resolvedContent: '[CHACHED] Doc 1 (version 1)',
      })
      .where(eq(documentVersions.commitId, draft.id))

    await destroyFolder({
      path: 'some-folder',
      commit: draft,
      workspace: workspace,
    }).then((r) => r.unwrap())

    const draftDocuments = await database.query.documentVersions.findMany({
      where: and(eq(documentVersions.commitId, draft.id)),
    })

    expect(draftDocuments.length).toBe(2)
    const deletedData = draftDocuments.map((d) => ({
      deletedAt: d.deletedAt,
      resolvedContent: d.resolvedContent,
    }))
    expect(deletedData).toEqual([
      {
        deletedAt: expect.any(Date),
        resolvedContent: null,
      },
      {
        deletedAt: expect.any(Date),
        resolvedContent: null,
      },
    ])
  })
})
