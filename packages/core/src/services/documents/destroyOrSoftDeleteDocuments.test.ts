import { database } from '$core/client'
import { documentVersions } from '$core/schema'
import { updateDocument } from '$core/services/documents/update'
import * as factories from '$core/tests/factories'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { destroyOrSoftDeleteDocuments } from './destroyOrSoftDeleteDocuments'

describe('destroyOrSoftDeleteDocuments', () => {
  it('remove documents that were not present in merged commits', async () => {
    const { project } = await factories.createProject()
    const { commit: draft } = await factories.createDraft({ project })
    const { documentVersion: draftDocument } =
      await factories.createDocumentVersion({
        commit: draft,
        path: 'doc1',
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

  it('mark as deleted documents that were present in merged commits and not in the draft commit', async () => {
    const { project, documents: allDocs } = await factories.createProject({
      documents: { doc1: 'Doc 1' },
    })
    const document = allDocs[0]!
    const { commit: draft } = await factories.createDraft({ project })

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

  it('mark as deleted documents present in the draft commit', async () => {
    const { project, documents: allDocs } = await factories.createProject({
      documents: { doc1: 'Doc 1' },
    })
    const document = allDocs[0]!
    const { commit: draft } = await factories.createDraft({ project })
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
