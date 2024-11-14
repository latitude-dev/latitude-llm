import { Hono } from 'hono'

import { evaluationResultsRouter } from './[evaluationUuid]/evaluationResults'

export const evaluationsRouter = new Hono()

evaluationsRouter.route(
  '/:evaluationUuid/evaluation-results',
  evaluationResultsRouter,
)
