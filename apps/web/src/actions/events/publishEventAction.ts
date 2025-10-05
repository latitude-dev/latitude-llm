'use server'

import { publisher } from '@latitude-data/core/events/publisher'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const publishEventAction = authProcedure
  .inputSchema(
    z.object({
      eventType: z.string(),
      payload: z.record(z.string(), z.any()).optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { eventType, payload } = parsedInput
    const data = {
      userEmail: ctx.user.email,
      workspaceId: ctx.workspace.id,
      ...(payload || {}),
    }

    publisher.publishLater({
      // @ts-expect-error - eventtype is more strict than string
      type: eventType,
      // @ts-expect-error - data is more strict than any() record
      data: data,
    })
  })
