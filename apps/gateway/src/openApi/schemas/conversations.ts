import { z } from '@hono/zod-openapi'
import { messageSchema } from './ai'

export const conversationPresenterSchema = z.object({
  uuid: z.string().openapi({ description: 'Conversation UUID' }),
  conversation: z.array(messageSchema),
})
