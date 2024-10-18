import ROUTES from '$/common/routes'
import { getHandler } from '$/routes/api/v1/projects/[projectId]/versions/[versionUuid]/documents/handlers/get'
import { Hono } from 'hono'

import { runHandler } from './handlers/run'

const router = new Hono()

router.get(ROUTES.Api.V2.Documents.Get, ...getHandler)
router.post(ROUTES.Api.V2.Documents.Run, ...runHandler)

export { router as documentsRouter }
