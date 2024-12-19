import { z } from '@hono/zod-openapi'

export const conversationsParamsSchema = z.object({
  conversationUuid: z.string().openapi({ description: 'Conversation UUID' }),
})
