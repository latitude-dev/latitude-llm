'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { createLatteJob } from '@latitude-data/core/services/copilot/index'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'

export const createNewLatteAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      message: z.string(),
      context: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace } = ctx
    const { message, context } = input

    const threadUuid = generateUUIDIdentifier()

    const runResult = await createLatteJob({
      threadUuid,
      workspace,
      message,
      context,
    })

    runResult.unwrap()

    return { uuid: threadUuid }
  })
