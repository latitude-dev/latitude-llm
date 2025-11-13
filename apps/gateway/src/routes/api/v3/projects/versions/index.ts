import { createRouter } from '$/openApi/createApp'
import { getVersionRoute } from './get/getCommit.route'
import { getVersionHandler } from './get/getCommit.handler'
import { createVersionRoute } from './create/createCommit.route'
import { createCommitHandler } from './create/createCommit.handler'
import { getAllVersionsRoute } from './getAll/getAllVersions.route'
import { getAllVersionsHandler } from './getAll/getAllVersions.handler'
import { publishCommitRoute } from './publish/publishCommit.route'
import { publishCommitHandler } from './publish/publishCommit.handler'
import { documentsRouter } from './documents'

export const versionsRouter = createRouter()
  .openapi(getVersionRoute, getVersionHandler)
  .openapi(getAllVersionsRoute, getAllVersionsHandler)
  .openapi(createVersionRoute, createCommitHandler)
  .openapi(publishCommitRoute, publishCommitHandler)

versionsRouter.route('/', documentsRouter)
