import { createRouter } from '$/openApi/createApp'
import { createCommitHandler } from './create/createCommit.handler'
import { createVersionRoute } from './create/createCommit.route'
import { documentsRouter } from './documents'
import { getVersionHandler } from './get/getCommit.handler'
import { getVersionRoute } from './get/getCommit.route'

export const versionsRouter = createRouter()
  .openapi(getVersionRoute, getVersionHandler)
  .openapi(createVersionRoute, createCommitHandler)

versionsRouter.route('/', documentsRouter)
