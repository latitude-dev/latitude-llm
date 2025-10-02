'use server'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { createCommit } from '@latitude-data/core/services/commits/create'
import { updateDocument } from '@latitude-data/core/services/documents/update'
import { z } from 'zod'

import { withProject } from '../procedures'
import { Commit } from '@latitude-data/core/schema/types'

export const createDraftWithPromptlUpgradeAction = withProject
  .createServerAction()
  .input(
    z.object({
      documentUuid: z.string().optional(),
      draftUuid: z.string().optional(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { user, workspace, project } = ctx
    const { documentUuid, draftUuid } = input

    let draft: Commit

    if (draftUuid) {
      const commitRepo = new CommitsRepository(workspace.id)
      draft = await commitRepo
        .getCommitByUuid({ uuid: draftUuid, projectId: project.id })
        .then((r) => r.unwrap())
    } else {
      draft = await createCommit({
        project,
        user,
        data: {
          title: 'Upgrade Syntax',
          description: 'Upgrade syntax to PromptL',
        },
      }).then((r) => r.unwrap())
    }

    const docsScope = new DocumentVersionsRepository(workspace.id)

    if (documentUuid) {
      const document = await docsScope
        .getDocumentAtCommit({
          commitUuid: draft.uuid,
          projectId: project.id,
          documentUuid,
        })
        .then((r) => r.unwrap())

      await updateDocument({
        commit: draft,
        document,
        promptlVersion: 1,
      }).then((r) => r.unwrap())
    }

    return draft
  })
