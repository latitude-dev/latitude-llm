import { z } from 'zod'
import { defineLatteTool } from '../types'
import { listApps } from '../../../../integrations/pipedream/apps'
import { Result } from '../../../../../lib/Result'

const searchAvailableIntegrations = defineLatteTool(
  async ({ query }) => {
    const appsResult = await listApps({
      query,
    })
    if (!Result.isOk(appsResult)) return appsResult

    const appsData = appsResult.unwrap()
    const apps = appsData.apps
    return Result.ok(
      apps.map((app) => ({
        name: app.nameSlug,
        description: app.description,
      })),
    )
  },
  z.object({
    query: z.string(),
  }),
)

export default searchAvailableIntegrations
