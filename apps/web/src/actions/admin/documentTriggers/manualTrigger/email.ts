'use server'

import { z } from 'zod'

import { withAdmin } from '../../../procedures'

import { registerEmailTriggerEvent } from '@latitude-data/core/services/documentTriggers/handlers/email/registerEvent'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { Result, TypedResult } from '@latitude-data/core/lib/Result'
import { Commit } from '@latitude-data/core/browser'

export const manualEmailTriggerAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      recipient: z.string().email(),
      senderEmail: z.string().email(),
      senderName: z.string(),
      subject: z.string(),
      body: z.string(),
      messageId: z.string().optional(),
      references: z.string().optional(),
      files: z.array(z.instanceof(File)).optional(),
      projectId: z.number().optional(),
      commitUuid: z.string().optional(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    let commitResult: TypedResult<Commit | undefined> = Result.ok(undefined)

    if (input.commitUuid && input.projectId) {
      const repository = new CommitsRepository(ctx.workspace.id)
      commitResult = await repository.getCommitByUuid({
        projectId: input.projectId,
        uuid: input.commitUuid,
      })
    }

    if (commitResult.error) throw commitResult.error

    registerEmailTriggerEvent({
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      senderEmail: input.senderEmail,
      senderName: input.senderName,
      messageId: input.messageId?.length ? input.messageId : undefined,
      parentMessageIds: input.references?.length
        ? input.references.split(' ')
        : undefined,
      attachments: input.files,
      commit: commitResult.value,
    })

    return {}
  })
