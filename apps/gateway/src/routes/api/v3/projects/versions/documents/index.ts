import { createRouter } from '$/openApi/createApp'
import { createDocumentHandler } from './create/create.handler'
import { createDocumentRoute } from './create/create.route'
import {
  createOrUpdateDocumentHandler,
  createOrUpdateDocumentRoute,
} from './createOrUpdate'
import { getHandler, getRouteV3 } from './get'
import { getAllHandler, getAllRoute } from './getAll'
import { getOrCreateHandler, getOrCreateRouteV3 } from './getOrCreate'
import { createLogHandler } from './logs/create.handler'
import { createLogRouteV3 } from './logs/create.route'
import { runHandler, runRoute } from './run'

export const documentsRouter = createRouter()
  .openapi(getRouteV3, getHandler)
  .openapi(getAllRoute, getAllHandler)
  .openapi(createDocumentRoute, createDocumentHandler)
  .openapi(createOrUpdateDocumentRoute, createOrUpdateDocumentHandler)
  .openapi(getOrCreateRouteV3, getOrCreateHandler)
  .openapi(runRoute, runHandler)
  .openapi(createLogRouteV3, createLogHandler)
