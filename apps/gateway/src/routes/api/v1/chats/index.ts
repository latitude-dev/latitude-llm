import ROUTES from '$/common/routes'
import { Hono } from 'hono'

import { addMessageHandler } from './handlers/addMessage'

const router = new Hono()

router.post(ROUTES.Api.V1.Chats.AddMessage, ...addMessageHandler)

export { router as chatsRouter }
