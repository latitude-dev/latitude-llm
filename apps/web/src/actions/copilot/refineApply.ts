'use server'

import { publisher } from '@latitude-data/core/events/publisher'
import { Result } from '@latitude-data/core/lib/Result'
import Transaction from '@latitude-data/core/lib/Transaction'
import { createCommit } from '@latitude-data/core/services/commits/create'
import { updateDocument } from '@latitude-data/core/services/documents/update'
import { z } from 'zod'
import { withDocument } from '../procedures'

export const refineApplyAction = withDocument
  .createServerAction()
  .input(
    z.object({
      prompt: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const result = await Transaction.call(async (tx) => {
      let draft
      if (ctx.commit.mergedAt) {
        draft = await createCommit(
          {
            project: ctx.project,
            user: ctx.user,
            data: {
              title: `Refined '${ctx.document.path.split('/').pop()}'`,
              description: 'Created by refiner.',
            },
          },
          tx,
        ).then((r) => r.unwrap())

        await updateDocument(
          {
            commit: draft,
            document: ctx.document,
            content: input.prompt,
          },
          tx,
        ).then((r) => r.unwrap())
      }

      publisher.publishLater({
        type: 'copilotRefinerApplied',
        data: {
          workspaceId: ctx.workspace.id,
          projectId: ctx.project.id,
          commitUuid: ctx.commit.uuid,
          documentUuid: ctx.document.documentUuid,
          userEmail: ctx.user.email,
        },
      })

      return Result.ok({ prompt: input.prompt, draft })
    }).then((r) => r.unwrap())

    return result
  })
