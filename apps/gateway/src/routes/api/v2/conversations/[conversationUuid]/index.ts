import { Hono } from 'hono'

import { chatHandler } from './handlers/chat'
import { evaluateHandler } from './handlers/evaluate'

export const conversationsRouter = new Hono()

conversationsRouter.post('/:conversationUuid/chat', ...chatHandler)
conversationsRouter.post('/:conversationUuid/evaluate', ...evaluateHandler)
