'use server'

import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { createCommit } from '@latitude-data/core/services/commits/create'
import { updateDocument } from '@latitude-data/core/services/documents/update'
import { z } from 'zod'

import { withProject } from '../procedures'

export const createDraftWithContentAction = withProject
  .createServerAction()
  .input(
    z.object({
      title: z.string(),
      description: z.string().optional().default(''),
      documentUuid: z.string(),
      content: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { user, workspace, project } = ctx

    const draft = await createCommit({
      project,
      user,
      data: {
        title: input.title,
        description: input.description,
      },
    }).then((r) => r.unwrap())

    const docsScope = new DocumentVersionsRepository(workspace.id)
    const document = await docsScope
      .getDocumentAtCommit({
        commitUuid: draft.uuid,
        projectId: project.id,
        documentUuid: input.documentUuid,
      })
      .then((r) => r.unwrap())

    await updateDocument({
      commit: draft,
      document,
      content: input.content,
    }).then((r) => r.unwrap())

    return draft
  })
