import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { database } from '../../client'
import { Providers } from '../../constants'
import { documentVersions } from '../../schema'
import * as factories from '../../tests/factories'
import { destroyOrSoftDeleteDocuments } from './destroyOrSoftDeleteDocuments'
import { updateDocument } from './update'

describe('destroyOrSoftDeleteDocuments', () => {
  it('remove documents that were not present in merged commits', async (ctx) => {
    const { project, user, workspace, providers } =
      await factories.createProject()
    const { commit: draft } = await factories.createDraft({ project, user })
    const { documentVersion: draftDocument } =
      await factories.createDocumentVersion({
        workspace,
        user,
        commit: draft,
        path: 'doc1',
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
        }),
      })

    await destroyOrSoftDeleteDocuments({
      commit: draft,
      documents: [draftDocument],
    }).then((r) => r.unwrap())

    const documents = await database.query.documentVersions.findMany({
      where: and(eq(documentVersions.documentUuid, draftDocument.documentUuid)),
    })

    expect(documents.length).toBe(0)
  })

  it('mark as deleted documents that were present in merged commits and not in the draft commit', async (ctx) => {
    const {
      project,
      user,
      documents: allDocs,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: ctx.factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })
    const document = allDocs[0]!
    const { commit: draft } = await factories.createDraft({ project, user })

    await destroyOrSoftDeleteDocuments({
      commit: draft,
      documents: [document],
    }).then((r) => r.unwrap())

    const documents = await database.query.documentVersions.findMany({
      where: and(eq(documentVersions.documentUuid, document.documentUuid)),
    })

    const drafDocument = documents.find((d) => d.commitId === draft.id)
    expect(documents.length).toBe(2)
    expect(drafDocument!.deletedAt).not.toBe(null)
  })

  it('mark as deleted documents present in the draft commit', async (ctx) => {
    const {
      project,
      user,
      documents: allDocs,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: ctx.factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })
    const document = allDocs[0]!
    const { commit: draft } = await factories.createDraft({ project, user })
    const draftDocument = await updateDocument({
      commit: draft,
      document,
      content: 'Doc 1 (version 2)',
    }).then((r) => r.unwrap())

    // Fake cached content exists to prove the method invalidate cache
    await database
      .update(documentVersions)
      .set({
        resolvedContent: '[CACHED] Doc 1 (version 1)',
      })
      .where(eq(documentVersions.commitId, draft.id))

    await destroyOrSoftDeleteDocuments({
      commit: draft,
      documents: [draftDocument],
    }).then((r) => r.unwrap())

    const documents = await database.query.documentVersions.findMany({
      where: and(eq(documentVersions.documentUuid, document.documentUuid)),
    })

    const drafDocument = documents.find((d) => d.commitId === draft.id)
    expect(documents.length).toBe(2)
    expect(drafDocument!.resolvedContent).toBeNull()
    expect(drafDocument!.deletedAt).not.toBe(null)
  })
})
