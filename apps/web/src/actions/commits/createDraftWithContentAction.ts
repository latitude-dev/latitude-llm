'use server'

import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { createCommit } from '@latitude-data/core/services/commits/create'
import { updateDocument } from '@latitude-data/core/services/documents/update'
import { z } from 'zod'

import { withProject } from '../procedures'

export const createDraftWithContentAction = withProject
  .inputSchema(
    z.object({
      title: z.string(),
      description: z.string().optional().default(''),
      documentUuid: z.string(),
      content: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { user, workspace, project } = ctx

    const draft = await createCommit({
      project,
      user,
      data: {
        title: parsedInput.title,
        description: parsedInput.description,
      },
    }).then((r) => r.unwrap())

    const docsScope = new DocumentVersionsRepository(workspace.id)
    const document = await docsScope
      .getDocumentAtCommit({
        commitUuid: draft.uuid,
        projectId: project.id,
        documentUuid: parsedInput.documentUuid,
      })
      .then((r) => r.unwrap())

    await updateDocument({
      commit: draft,
      document,
      content: parsedInput.content,
    }).then((r) => r.unwrap())

    return draft
  })
