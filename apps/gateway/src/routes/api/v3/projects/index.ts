import { getCommitRoute } from './getCommit'
import { createRouter } from '$/openApi/createApp'
import { getCommitHandler } from './getCommit/getCommit.handler'
import { getAllRoute } from './getAll'
import { getAllHandler } from './getAll/getAll.handler'
import { createRoute as createProjectRoute } from './create'
import { createHandler } from './create/create.handler'
import { pushCommitRoute } from './pushCommit'
import { pushCommitHandler } from './pushCommit/pushCommit.handler'
import { createDocumentHandler, createDocumentRoute } from './documents/create'
import { createCommitHandler, createCommitRoute } from './createCommit'

const router = createRouter()
  .openapi(createCommitRoute, createCommitHandler)
  .openapi(getCommitRoute, getCommitHandler)
  .openapi(getAllRoute, getAllHandler)
  .openapi(createProjectRoute, createHandler)
  .openapi(pushCommitRoute, pushCommitHandler)
  .openapi(createDocumentRoute, createDocumentHandler)

export default router
