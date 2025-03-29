'use server'

import { Commit } from '@latitude-data/core'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core'
import { createCommit } from '@latitude-data/core'
import { updateDocument } from '@latitude-data/core'
import { z } from 'zod'

import { withProject } from '../procedures'

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
    } else {
      const documents = await docsScope
        .getDocumentsAtCommit(draft)
        .then((r) => r.unwrap())

      await Promise.all(
        documents
          .filter((doc) => doc.promptlVersion === 0)
          .map((doc) =>
            updateDocument({
              commit: draft,
              document: doc,
              promptlVersion: 1,
            }).then((r) => r.unwrap()),
          ),
      )
    }

    return draft
  })
