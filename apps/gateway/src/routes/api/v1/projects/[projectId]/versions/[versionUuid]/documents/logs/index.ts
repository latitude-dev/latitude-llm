import { postHandler } from '$/routes/api/v2/projects/[projectId]/versions/[versionUuid]/documents/logs/handlers/post'
import { Hono } from 'hono'

const router = new Hono()

router.post('/', ...postHandler)

export { router as logsRouterV1 }
