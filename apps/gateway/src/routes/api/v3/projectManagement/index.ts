import { createRouter } from '$/openApi/createApp'

import { listPromptsRoute } from './prompts/list/listPrompts.route'
import { listPromptsHandler } from './prompts/list/listPrompts.handler'
import { createPromptRoutes } from './prompts/create/createPrompt.route'
import { createPromptHandler } from './prompts/create/createPrompt.handler'
import { readPromptRoute } from './prompts/read/readPrompt.route'
import { readPromptHandler } from './prompts/read/readPrompt.handler'
import { updatePromptRoutes } from './prompts/update/updatePrompt.route'
import { updatePromptHandler } from './prompts/update/updatePrompt.handler'
import { deletePromptRoute } from './prompts/delete/deletePrompt.route'
import { deletePromptHandler } from './prompts/delete/deletePrompt.handler'

const router = createRouter()
  .openapi(listPromptsRoute, listPromptsHandler)
  .openapi(readPromptRoute, readPromptHandler)
  .openapi(deletePromptRoute, deletePromptHandler)

updatePromptRoutes.forEach((route) => {
  router.openapi(route, updatePromptHandler)
})

createPromptRoutes.forEach((route) => {
  router.openapi(route, createPromptHandler)
})

export default router
