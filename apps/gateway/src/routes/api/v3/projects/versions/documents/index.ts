import { createRouter } from '$/openApi/createApp'
import { route } from '$/routes/api/helpers'
import { API_ROUTES } from '$/api.routes'

import { createDocumentHandler } from '$/routes/api/v3/projects/versions/documents/create/create.handler'
import { createDocumentRouteConfig } from '$/routes/api/v3/projects/versions/documents/create/create.route'
import {
  createOrUpdateDocumentHandler,
  createOrUpdateDocumentRouteConfig,
} from '$/routes/api/v3/projects/versions/documents/createOrUpdate'
import {
  destroyDocumentHandler,
  destroyDocumentRouteConfig,
} from '$/routes/api/v3/projects/versions/documents/destroy'
import {
  getHandler,
  getRouteConfig,
} from '$/routes/api/v3/projects/versions/documents/get'
import {
  getAllHandler,
  getAllRouteConfig,
} from '$/routes/api/v3/projects/versions/documents/getAll'
import {
  getOrCreateHandler,
  getOrCreateRouteConfig,
} from '$/routes/api/v3/projects/versions/documents/getOrCreate'
import { createLogHandler } from '$/routes/api/v3/projects/versions/documents/logs/create.handler'
import { createLogRouteConfig } from '$/routes/api/v3/projects/versions/documents/logs/create.route'
import {
  runHandler,
  runRouteConfig,
} from '$/routes/api/v3/projects/versions/documents/run'

export const documentsRouter = createRouter()
  .openapi(
    route(getRouteConfig, API_ROUTES.v3.projects.documents.get),
    getHandler,
  )
  .openapi(
    route(getAllRouteConfig, API_ROUTES.v3.projects.documents.getAll),
    getAllHandler,
  )
  .openapi(
    route(createDocumentRouteConfig, API_ROUTES.v3.projects.documents.create),
    createDocumentHandler,
  )
  .openapi(
    route(
      createOrUpdateDocumentRouteConfig,
      API_ROUTES.v3.projects.documents.createOrUpdate,
    ),
    createOrUpdateDocumentHandler,
  )
  .openapi(
    route(getOrCreateRouteConfig, API_ROUTES.v3.projects.documents.getOrCreate),
    getOrCreateHandler,
  )
  .openapi(
    route(destroyDocumentRouteConfig, API_ROUTES.v3.projects.documents.destroy),
    destroyDocumentHandler,
  )
  .openapi(
    route(runRouteConfig, API_ROUTES.v3.projects.documents.run),
    runHandler,
  )
  .openapi(
    route(createLogRouteConfig, API_ROUTES.v3.projects.documents.logs),
    createLogHandler,
  )
