import { Hono } from 'hono'

import { getOrCreateHandler } from './handlers/getOrCreate'

export const evaluationsRouter = new Hono()

evaluationsRouter.post('/get-or-create', ...getOrCreateHandler)
