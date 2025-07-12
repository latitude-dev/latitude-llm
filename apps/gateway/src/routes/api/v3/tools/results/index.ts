import { createRouter } from '$/openApi/createApp'
import { clientToolResultRoute } from './route'
import { clientToolResultHandler } from './handler'

export const toolResultsRouter = createRouter().openapi(
  clientToolResultRoute,
  clientToolResultHandler,
)
