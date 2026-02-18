import { createRouter } from '$/openApi/createApp'
import { route } from '$/routes/api/helpers'
import { API_ROUTES } from '$/api.routes'

import { documentsRouter } from './documents'
import { getVersionRouteConfig } from '$/routes/api/v3/projects/versions/get/getCommit.route'
import { getVersionHandler } from '$/routes/api/v3/projects/versions/get/getCommit.handler'
import { createVersionRouteConfig } from '$/routes/api/v3/projects/versions/create/createCommit.route'
import { createCommitHandler } from '$/routes/api/v3/projects/versions/create/createCommit.handler'
import { getAllVersionsRouteConfig } from '$/routes/api/v3/projects/versions/getAll/getAllVersions.route'
import { getAllVersionsHandler } from '$/routes/api/v3/projects/versions/getAll/getAllVersions.handler'
import { publishCommitRouteConfig } from '$/routes/api/v3/projects/versions/publish/publishCommit.route'
import { publishCommitHandler } from '$/routes/api/v3/projects/versions/publish/publishCommit.handler'

export const versionsRouter = createRouter()
  .openapi(
    route(getVersionRouteConfig, API_ROUTES.v3.projects.versions.get),
    getVersionHandler,
  )
  .openapi(
    route(getAllVersionsRouteConfig, API_ROUTES.v3.projects.versions.getAll),
    getAllVersionsHandler,
  )
  .openapi(
    route(createVersionRouteConfig, API_ROUTES.v3.projects.versions.create),
    createCommitHandler,
  )
  .openapi(
    route(publishCommitRouteConfig, API_ROUTES.v3.projects.versions.publish),
    publishCommitHandler,
  )

versionsRouter.route('/', documentsRouter)
