import { createRouter } from '$/openApi/createApp'
import { createHandler } from './create/create.handler'
import { createRoute } from './create/create.route'
import { getAllHandler } from './getAll/getAll.handler'
import { getAllRoute } from './getAll/getAll.route'
import { pushHandler } from './push/push.handler'
import { pushRoute } from './push/push.route'
import { versionsRouter } from './versions'

export const projectsRouter = createRouter()
  .openapi(getAllRoute, getAllHandler)
  .openapi(createRoute, createHandler)
  .openapi(pushRoute, pushHandler)

projectsRouter.route('/', versionsRouter)
