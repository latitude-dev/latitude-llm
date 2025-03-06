import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { database } from '../../client'
import { Providers } from '../../constants'
import { documentVersions, evaluationVersions } from '../../schema'
import * as factories from '../../tests/factories'
import { updateEvaluationV2 } from '../evaluationsV2'
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
    await factories.createEvaluationV2({
      document: draftDocument,
      commit: draft,
      workspace: workspace,
    })

    await destroyOrSoftDeleteDocuments({
      commit: draft,
      documents: [draftDocument],
      workspace: workspace,
    }).then((r) => r.unwrap())

    const documents = await database.query.documentVersions.findMany({
      where: eq(documentVersions.documentUuid, draftDocument.documentUuid),
    })
    expect(documents.length).toBe(0)

    const evaluations = await database.query.evaluationVersions.findMany({
      where: eq(evaluationVersions.documentUuid, draftDocument.documentUuid),
    })
    expect(evaluations.length).toBe(0)
  })

  it('mark as deleted documents that were present in merged commits and not in the draft commit', async (ctx) => {
    const {
      workspace,
      project,
      user,
      commit,
      documents: allDocs,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: ctx.factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })
    const document = allDocs[0]!
    await factories.createEvaluationV2({ document, commit, workspace })
    const { commit: draft } = await factories.createDraft({ project, user })

    await destroyOrSoftDeleteDocuments({
      commit: draft,
      documents: [document],
      workspace: workspace,
    }).then((r) => r.unwrap())

    const documents = await database.query.documentVersions.findMany({
      where: eq(documentVersions.documentUuid, document.documentUuid),
    })
    const drafDocument = documents.find((d) => d.commitId === draft.id)
    expect(documents.length).toBe(2)
    expect(drafDocument!.deletedAt).not.toBe(null)

    const evaluations = await database.query.evaluationVersions.findMany({
      where: eq(evaluationVersions.documentUuid, document.documentUuid),
    })
    const draftEvaluation = evaluations.find((e) => e.commitId === draft.id)
    expect(evaluations.length).toBe(2)
    expect(draftEvaluation!.deletedAt).not.toBe(null)
  })

  it('mark as deleted documents present in the draft commit', async (ctx) => {
    const {
      workspace,
      project,
      user,
      commit,
      documents: allDocs,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: ctx.factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })
    const document = allDocs[0]!
    const evaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
    })
    const { commit: draft } = await factories.createDraft({ project, user })
    const draftDocument = await updateDocument({
      commit: draft,
      document,
      content: 'Doc 1 (version 2)',
    }).then((r) => r.unwrap())
    await updateEvaluationV2({
      evaluation: evaluation,
      commit: draft,
      settings: { name: 'New name' },
      workspace: workspace,
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
      workspace,
    }).then((r) => r.unwrap())

    const documents = await database.query.documentVersions.findMany({
      where: eq(documentVersions.documentUuid, document.documentUuid),
    })
    const drafDocument = documents.find((d) => d.commitId === draft.id)
    expect(documents.length).toBe(2)
    expect(drafDocument!.resolvedContent).toBeNull()
    expect(drafDocument!.deletedAt).not.toBe(null)

    const evaluations = await database.query.evaluationVersions.findMany({
      where: eq(evaluationVersions.documentUuid, document.documentUuid),
    })
    const draftEvaluation = evaluations.find((e) => e.commitId === draft.id)
    expect(evaluations.length).toBe(2)
    expect(draftEvaluation!.deletedAt).not.toBe(null)
  })
})
