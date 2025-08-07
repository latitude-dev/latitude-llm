import { z } from 'zod'
import { searchComponents } from '../../../../integrations/pipedream/apps'
import { defineLatteTool } from '../types'

const searchIntegrationResources = defineLatteTool(
  async ({ app, query, type }) => {
    const componentType = type === 'tools' ? 'tool' : 'trigger'
    return searchComponents({
      app,
      query,
      componentType,
    })
  },
  z.object({
    app: z.string(),
    query: z.string().optional(),
    type: z.enum(['tools', 'triggers']),
  }),
)

export default searchIntegrationResources
