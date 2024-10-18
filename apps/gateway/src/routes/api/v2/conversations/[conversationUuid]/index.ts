import ROUTES from '$/common/routes'
import { chatHandler } from '$/routes/api/v1/conversations/[conversationUuid]/handlers/chat'
import { Hono } from 'hono'

export const chatsRouter = new Hono()

chatsRouter.post(ROUTES.Api.V2.Conversations.Chat, ...chatHandler)
