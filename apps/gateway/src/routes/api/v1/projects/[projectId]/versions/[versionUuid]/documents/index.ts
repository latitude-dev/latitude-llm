import ROUTES from '$/common/routes'
import { Hono } from 'hono'

import { getHandler } from './handlers/get'
import { runHandler } from './handlers/run'

const router = new Hono()

router.get(ROUTES.Api.V1.Documents.Get, ...getHandler)
router.post(ROUTES.Api.V1.Documents.Run, ...runHandler)

export { router as documentsRouter }
