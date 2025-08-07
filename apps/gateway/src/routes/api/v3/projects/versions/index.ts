import { createRouter } from '$/openApi/createApp'
import { getVersionRoute } from './get/getCommit.route'
import { getVersionHandler } from './get/getCommit.handler'
import { createVersionRoute } from './create/createCommit.route'
import { createCommitHandler } from './create/createCommit.handler'
import { documentsRouter } from './documents'

export const versionsRouter = createRouter()
  .openapi(getVersionRoute, getVersionHandler)
  .openapi(createVersionRoute, createCommitHandler)

versionsRouter.route('/', documentsRouter)
