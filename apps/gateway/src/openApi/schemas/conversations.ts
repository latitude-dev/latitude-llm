import { z } from '@hono/zod-openapi'
import { messageSchema } from './ai'

const promptSourceSchema = z
  .object({
    commitUuid: z.string().optional(),
    documentUuid: z.string().optional(),
    evaluationUuid: z.string().optional(),
  })
  .optional()
  .openapi({ description: 'Source information for the conversation' })

export const conversationPresenterSchema = z.object({
  uuid: z.string().openapi({ description: 'Conversation UUID' }),
  conversation: z.array(messageSchema),
  source: promptSourceSchema,
})
