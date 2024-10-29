import { Hono } from 'hono'

import { postHandler } from './handlers/post'

const router = new Hono()

router.post('/', ...postHandler)

export { router as logsRouterV2 }
