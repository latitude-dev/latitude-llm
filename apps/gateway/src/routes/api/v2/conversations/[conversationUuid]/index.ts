import { chatHandler } from '$/routes/api/v1/conversations/[conversationUuid]/handlers/chat'
import { Hono } from 'hono'

import { evaluateHandler } from './handlers/evaluate'

export const conversationsRouter = new Hono()

conversationsRouter.post('/:conversationUuid/chat', ...chatHandler)
conversationsRouter.post('/:conversationUuid/evaluate', ...evaluateHandler)
