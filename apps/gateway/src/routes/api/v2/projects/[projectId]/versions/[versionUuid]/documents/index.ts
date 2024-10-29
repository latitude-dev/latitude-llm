import { getHandler } from '$/routes/api/v1/projects/[projectId]/versions/[versionUuid]/documents/handlers/get'
import { Hono } from 'hono'

import { runHandler } from './handlers/run'
import { logsRouterV2 } from './logs'

const router = new Hono()

router.get('/:documentPath{.+}', ...getHandler)
router.post('/run', ...runHandler)
router.route('/logs', logsRouterV2)

export { router as documentsRouter }
