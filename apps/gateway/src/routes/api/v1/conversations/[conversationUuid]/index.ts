import { Hono } from 'hono'

import { chatHandler } from './handlers/chat'

export const chatsRouter = new Hono()

chatsRouter.post('/:conversationUuid/chat', ...chatHandler)
