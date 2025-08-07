import { createRouter } from '$/openApi/createApp'
import { clientToolResultHandler } from './handler'
import { clientToolResultRoute } from './route'

export const toolResultsRouter = createRouter().openapi(
  clientToolResultRoute,
  clientToolResultHandler,
)
