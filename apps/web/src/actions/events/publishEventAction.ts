'use server'

import { publisher } from '@latitude-data/core/events/publisher'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const publishEventAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      eventType: z.string(),
      payload: z.record(z.any()).optional(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { eventType, payload } = input
    const data = {
      userEmail: ctx.user.email,
      workspaceId: ctx.workspace.id,
      ...(payload || {}),
    }
    publisher.publishLater({
      // @ts-expect-error - Type not typed in this action
      type: eventType,
      // @ts-expect-error - Type not typed in this action
      data: data,
    })
  })
