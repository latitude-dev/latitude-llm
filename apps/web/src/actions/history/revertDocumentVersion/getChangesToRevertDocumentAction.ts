'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withProject } from '../../procedures'
import { computeDocumentRevertChanges } from '@latitude-data/core/services/documents/computeRevertChanges'
import { getDocumentsAtCommitCached } from '$/app/(private)/_data-access'
import { DraftChange } from '../types'
import { Commit, DocumentVersion } from '@latitude-data/core/browser'

async function getDocumentAtCommit({
  commit,
  documentUuid,
}: {
  commit: Commit
  documentUuid: string
}): Promise<DocumentVersion | undefined> {
  return getDocumentsAtCommitCached({ commit }).then((documents) =>
    documents.find((d) => d.documentUuid === documentUuid),
  )
}

export const getChangesToRevertDocumentAction = withProject
  .createServerAction()
  .input(
    z.object({
      targetDraftId: z.number().optional(),
      documentCommitUuid: z.string(),
      documentUuid: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { workspace, project } = ctx
    const { targetDraftId, documentCommitUuid, documentUuid } = input

    const commitScope = new CommitsRepository(workspace.id)
    const headCommit = await commitScope
      .getHeadCommit(project.id)
      .then((r) => r.unwrap())

    const targetDraft = await commitScope
      .getCommitById(targetDraftId ?? headCommit!.id)
      .then((r) => r.unwrap())

    const changedCommit = await commitScope
      .getCommitByUuid({ projectId: project.id, uuid: documentCommitUuid })
      .then((r) => r.unwrap())
    const originalCommit = await commitScope.getPreviousCommit(changedCommit)

    const draftDocument = await getDocumentAtCommit({
      commit: targetDraft,
      documentUuid: documentUuid,
    })
    const changedDocument = await getDocumentAtCommit({
      commit: changedCommit,
      documentUuid: documentUuid,
    })
    const originalDocument = originalCommit
      ? await getDocumentAtCommit({
          commit: originalCommit,
          documentUuid: documentUuid,
        })
      : undefined

    const change = await computeDocumentRevertChanges({
      workspace: workspace,
      draft: targetDraft,
      changedDocument,
      originalDocument,
    }).then((r) => r.unwrap())

    const isCreated = change.deletedAt === null
    const isDeleted = !isCreated && change.deletedAt !== undefined

    const newDocumentPath =
      change.path ??
      draftDocument?.path ??
      changedDocument?.path ??
      originalDocument!.path

    const oldDocumentPath =
      draftDocument?.path ??
      originalDocument?.path ??
      changedDocument?.path ??
      newDocumentPath

    const previousContent =
      draftDocument?.content ??
      changedDocument?.content ??
      originalDocument?.content

    const newContent = isDeleted
      ? undefined
      : (change.content ?? previousContent)

    const oldCOntent = isCreated ? undefined : previousContent

    const draftChange: DraftChange = {
      newDocumentPath,
      oldDocumentPath,
      content: {
        oldValue: oldCOntent,
        newValue: newContent,
      },
    }

    return [draftChange]
  })
