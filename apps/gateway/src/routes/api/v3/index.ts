import { createRouter } from '$/openApi/createApp'

import { conversationsRouter } from './conversations'
import { projectsRouter } from './projects'
import { tracesRouter } from './traces'
import { datasetsRouter } from './datasets'
import { datasetRowsRouter } from './datasetRows'
import { providerApiKeysRouter } from './providerApiKeys'
import { toolResultsRouter } from './tools/results'

export const v3Router = createRouter()
  .route('/', conversationsRouter)
  .route('/', projectsRouter)
  .route('/', tracesRouter)
  .route('/', toolResultsRouter)
  .route('/', datasetsRouter)
  .route('/', datasetRowsRouter)
  .route('/', providerApiKeysRouter)
