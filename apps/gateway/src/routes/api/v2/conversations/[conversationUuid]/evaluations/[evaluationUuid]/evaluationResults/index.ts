import { Hono } from 'hono'

import { postHandler } from './handlers/post'

export const evaluationResultsRouter = new Hono()

evaluationResultsRouter.post('/', ...postHandler)
