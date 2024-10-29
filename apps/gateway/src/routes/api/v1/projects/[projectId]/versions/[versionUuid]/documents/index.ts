import { Hono } from 'hono'

import { getHandler } from './handlers/get'
import { runHandler } from './handlers/run'
import { logsRouterV1 } from './logs'

const router = new Hono()

router.get('/:documentPath{.+}', ...getHandler)
router.post('/run', ...runHandler)
router.route('/logs', logsRouterV1)

export { router as documentsRouter }
