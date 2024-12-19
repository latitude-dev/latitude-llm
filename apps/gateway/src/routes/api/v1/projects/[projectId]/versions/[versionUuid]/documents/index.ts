import { Hono } from 'hono'

import { runHandler } from './handlers/run'

const router = new Hono()

router.post('/run', ...runHandler)

export { router as documentsRouter }
