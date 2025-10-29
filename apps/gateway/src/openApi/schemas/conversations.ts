import { z } from '@hono/zod-openapi'
import { messageSchema } from '@latitude-data/core/constants'

export const conversationPresenterSchema = z.object({
  uuid: z.string(),
  conversation: z.array(messageSchema),
})
