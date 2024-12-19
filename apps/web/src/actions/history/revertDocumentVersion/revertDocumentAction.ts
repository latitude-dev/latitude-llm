'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withProject } from '../../procedures'
import { computeDocumentRevertChanges } from '@latitude-data/core/services/documents/computeRevertChanges'
import { getDocumentsAtCommitCached } from '$/app/(private)/_data-access'
import { Commit, DocumentVersion } from '@latitude-data/core/browser'
import { createCommit } from '@latitude-data/core/services/commits/create'
import { updateDocument } from '@latitude-data/core/services/documents/update'

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

export const revertDocumentChangesAction = withProject
  .createServerAction()
  .input(
    z.object({
      targetDraftId: z.number().optional(),
      documentCommitUuid: z.string(),
      documentUuid: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { user, workspace, project } = ctx
    const { targetDraftId, documentCommitUuid, documentUuid } = input

    const commitScope = new CommitsRepository(workspace.id)
    const headCommit = await commitScope
      .getHeadCommit(project.id)
      .then((r) => r.unwrap()!)

    const currentCommit = targetDraftId
      ? await commitScope.getCommitById(targetDraftId).then((r) => r.unwrap())
      : headCommit

    const changedCommit = await commitScope
      .getCommitByUuid({ projectId: project.id, uuid: documentCommitUuid })
      .then((r) => r.unwrap())

    const originalCommit = await commitScope.getPreviousCommit(changedCommit)

    const currentDocument = await getDocumentAtCommit({
      commit: currentCommit,
      documentUuid,
    })
    const changedDocument = await getDocumentAtCommit({
      commit: changedCommit,
      documentUuid,
    })
    const originalDocument = originalCommit
      ? await getDocumentAtCommit({
          commit: originalCommit,
          documentUuid: documentUuid,
        })
      : undefined

    const documentVersionChanges = await computeDocumentRevertChanges({
      workspace: workspace,
      draft: currentCommit,
      changedDocument,
      originalDocument,
    }).then((r) => r.unwrap())

    const oldDocumentPath =
      currentDocument?.path ??
      originalDocument?.path ??
      changedDocument?.path ??
      documentVersionChanges.path

    const targetDraft = targetDraftId
      ? currentCommit
      : await createCommit({
          project: project,
          user: user,
          data: {
            title: `Revert changes for "${oldDocumentPath}"`,
            description: `Reverted changes of "${oldDocumentPath}" made in version ${changedCommit.title}`,
          },
        }).then((r) => r.unwrap())

    await updateDocument({
      commit: targetDraft,
      document: changedDocument ?? originalDocument!,
      path: documentVersionChanges.path,
      content: documentVersionChanges.content,
      deletedAt: documentVersionChanges.deletedAt,
    }).then((r) => r.unwrap())

    return {
      commitUuid: targetDraft.uuid,
      documentUuid:
        documentVersionChanges.deletedAt != null ? undefined : documentUuid,
    }
  })
