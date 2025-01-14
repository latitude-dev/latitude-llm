'use server'

import { z } from 'zod'

import { withDocument } from '../procedures'
import { DocumentLogsRepository } from '@latitude-data/core/repositories'
import { addToolResponse } from '@latitude-data/core/services/documentLogs/addToolResponse/index'
import { toolCallResponseSchema } from '@latitude-data/constants'

export const addToolResponseAction = withDocument
  .createServerAction()
  .input(
    z.object({
      documentLogUuid: z.string(),
      toolCallResponse: toolCallResponseSchema,
    }),
  )
  .handler(async ({ ctx, input }) => {
    const logRepo = new DocumentLogsRepository(ctx.workspace.id)
    const documentLog = await logRepo
      .findByUuid(input.documentLogUuid)
      .then((r) => r.unwrap())

    const result = await addToolResponse({
      documentLog,
      toolCallResponse: input.toolCallResponse,
    })

    if (result.error) throw result.error

    const { messages } = result.value

    return { messages }
  })
