'use server'

import { z } from 'zod'
import { withProject, withProjectSchema } from '../procedures'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { updateCommit } from '@latitude-data/core/services/commits/update'

export const setCommitMainDocumentAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      commitId: z.number(),
      documentUuid: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { workspace } = ctx
    const { commitId, documentUuid } = parsedInput

    const commitScope = new CommitsRepository(workspace.id)
    const commit = await commitScope
      .getCommitById(commitId)
      .then((r) => r.unwrap())

    const data: { mainDocumentUuid: string | null } = { mainDocumentUuid: null }

    if (documentUuid) {
      const documentScope = new DocumentVersionsRepository(workspace.id)
      const document = await documentScope
        .getDocumentAtCommit({
          projectId: commit.projectId,
          commitUuid: commit.uuid,
          documentUuid,
        })
        .then((r) => r.unwrap())

      data.mainDocumentUuid = document.documentUuid
    }

    const updatedCommit = await updateCommit({
      workspace,
      commit,
      data,
    }).then((r) => r.unwrap())

    return updatedCommit
  })
