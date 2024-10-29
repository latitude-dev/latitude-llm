import { chatHandler } from '$/routes/api/v1/conversations/[conversationUuid]/handlers/chat'
import { Hono } from 'hono'

export const chatsRouter = new Hono()

chatsRouter.post('/:conversationUuid/chat', ...chatHandler)
