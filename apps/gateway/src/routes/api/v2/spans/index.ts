import { Hono } from 'hono'

import { createHandler } from './handlers/create'

const router = new Hono()

router.post('/', ...createHandler)

export { router as spansRouter }
