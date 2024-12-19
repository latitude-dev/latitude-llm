import { createRouter } from '$/openApi/createApp'

import { chatRoute, chatHandler } from '$/routes/v2/conversations/chat'

const router = createRouter().openapi(chatRoute, chatHandler)

export default router
