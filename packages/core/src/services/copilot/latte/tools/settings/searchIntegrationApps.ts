import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import { listApps } from '../../../../integrations/pipedream/apps'
import { defineLatteTool } from '../types'

const searchIntegrationResources = defineLatteTool(
  async ({ query }) => {
    const result = await listApps({
      query,
    })
    if (!Result.isOk(result)) return result

    const apps = result.unwrap().apps
    return Result.ok(
      apps.map((app) => ({
        name: app.name_slug,
        description: app.description,
      })),
    )
  },
  z.object({
    query: z.string(),
  }),
)

export default searchIntegrationResources
