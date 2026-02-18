import { createRouter } from '$/openApi/createApp'
import { route } from '$/routes/api/helpers'
import { API_ROUTES } from '$/api.routes'

import { versionsRouter } from './versions'
import { createRouteConfig } from '$/routes/api/v3/projects/create/create.route'
import { createHandler } from '$/routes/api/v3/projects/create/create.handler'
import { pushRouteConfig } from '$/routes/api/v3/projects/push/push.route'
import { pushHandler } from '$/routes/api/v3/projects/push/push.handler'
import { getAllRouteConfig } from '$/routes/api/v3/projects/getAll/getAll.route'
import { getAllHandler } from '$/routes/api/v3/projects/getAll/getAll.handler'

export const projectsRouter = createRouter()
  .openapi(
    route(getAllRouteConfig, API_ROUTES.v4.projects.getAll),
    getAllHandler,
  )
  .openapi(
    route(createRouteConfig, API_ROUTES.v4.projects.create),
    createHandler,
  )
  .openapi(
    route(pushRouteConfig, API_ROUTES.v4.projects.push),
    pushHandler,
    // prettier-ignore
  )

projectsRouter.route('/', versionsRouter)
