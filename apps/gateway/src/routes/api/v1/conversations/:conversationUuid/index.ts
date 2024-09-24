import ROUTES from '$/common/routes'
import { Hono } from 'hono'

import { chatHandler } from './handlers/chat'

export const chatsRouter = new Hono()

chatsRouter.post(ROUTES.Api.V1.Conversations.Chat, ...chatHandler)
