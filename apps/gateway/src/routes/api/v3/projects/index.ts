import { createRouter } from '$/openApi/createApp'
import { getAllHandler } from './getAll/getAll.handler'
import { createHandler } from './create/create.handler'
import { createRoute } from './create/create.route'
import { getHandler } from './get/get.handler' // Assuming get.handler.ts exports getHandler
import { getRoute } from './get/get.route' // Assuming get.route.ts exports getRoute
import { pushRoute } from './push/push.route'
import { pushHandler } from './push/push.handler'
import { getAllRoute } from './getAll/getAll.route'
import { versionsRouter } from './versions'

export const projectsRouter = createRouter()
  .openapi(getAllRoute, getAllHandler)
  .openapi(createRoute, createHandler)
  .openapi(getRoute, getHandler)
  .openapi(pushRoute, pushHandler)

projectsRouter.route('/', versionsRouter)
