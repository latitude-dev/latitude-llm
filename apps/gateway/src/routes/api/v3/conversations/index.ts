import { createRouter } from '$/openApi/createApp'
import { chatRoute, chatHandler } from './chat'

const router = createRouter().openapi(chatRoute, chatHandler)

export default router
