import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { database } from '../../client'
import { Providers } from '@latitude-data/constants'
import { documentVersions } from '../../schema/models/documentVersions'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import * as factories from '../../tests/factories'
import { updateEvaluationV2 } from '../evaluationsV2/update'
import { destroyOrSoftDeleteDocuments } from './destroyOrSoftDeleteDocuments'
import { updateDocument } from './update'
import * as publisherModule from '../../events/publisher'

const publisherSpy = vi.spyOn(publisherModule.publisher, 'publishLater')

describe('destroyOrSoftDeleteDocuments', () => {
  beforeEach(() => {
    publisherSpy.mockClear()
  })
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

    const documents = await database
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentUuid, draftDocument.documentUuid))
    expect(documents.length).toBe(0)

    const evaluations = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.documentUuid, draftDocument.documentUuid))
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

    const documents = await database
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentUuid, document.documentUuid))
    const drafDocument = documents.find((d) => d.commitId === draft.id)
    expect(documents.length).toBe(2)
    expect(drafDocument!.deletedAt).not.toBe(null)

    const evaluations = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.documentUuid, document.documentUuid))
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

    const documents = await database
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentUuid, document.documentUuid))
    const drafDocument = documents.find((d) => d.commitId === draft.id)
    expect(documents.length).toBe(2)
    expect(drafDocument!.resolvedContent).toBeNull()
    expect(drafDocument!.deletedAt).not.toBe(null)

    const evaluations = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.documentUuid, document.documentUuid))
    const draftEvaluation = evaluations.find((e) => e.commitId === draft.id)
    expect(evaluations.length).toBe(2)
    expect(draftEvaluation!.deletedAt).not.toBe(null)
  })

  it('publishes documentsDeleted event with correct payload for hard deleted documents', async (ctx) => {
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
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(publisherSpy).toHaveBeenCalledWith({
      type: 'documentsDeleted',
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        commitUuid: draft.uuid,
        documentUuids: [draftDocument.documentUuid],
        documentPaths: [draftDocument.path],
        softDeletedDocumentUuids: [],
        hardDeletedDocumentUuids: [draftDocument.documentUuid],
      },
    })
  })

  it('publishes documentsDeleted event with correct payload for soft deleted documents', async (ctx) => {
    const {
      workspace,
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
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(publisherSpy).toHaveBeenCalledWith({
      type: 'documentsDeleted',
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        commitUuid: draft.uuid,
        documentUuids: [document.documentUuid],
        documentPaths: [document.path],
        softDeletedDocumentUuids: [document.documentUuid],
        hardDeletedDocumentUuids: [],
      },
    })
  })
})
