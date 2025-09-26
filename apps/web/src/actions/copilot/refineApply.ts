'use server'

import { publisher } from '@latitude-data/core/events/publisher'
import { Result } from '@latitude-data/core/lib/Result'
import Transaction from '@latitude-data/core/lib/Transaction'
import { createCommit } from '@latitude-data/core/services/commits/create'
import { updateDocument } from '@latitude-data/core/services/documents/update'
import { z } from 'zod'
import { withDocument, withDocumentSchema } from '../procedures'

export const refineApplyAction = withDocument
  .inputSchema(withDocumentSchema.extend({ prompt: z.string() }))
  .action(async ({ ctx, parsedInput }) => {
    const transaction = new Transaction()
    const result = transaction
      .call(
        async () => {
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
              transaction,
            ).then((r) => r.unwrap())

            await updateDocument(
              {
                commit: draft,
                document: ctx.document,
                content: parsedInput.prompt,
              },
              transaction,
            ).then((r) => r.unwrap())
          }

          return Result.ok({ prompt: parsedInput.prompt, draft })
        },
        () =>
          publisher.publishLater({
            type: 'copilotRefinerApplied',
            data: {
              workspaceId: ctx.workspace.id,
              projectId: ctx.project.id,
              commitUuid: ctx.commit.uuid,
              documentUuid: ctx.document.documentUuid,
              userEmail: ctx.user.email,
            },
          }),
      )
      .then((r) => r.unwrap())

    return result
  })
