import { IntegrationType } from '@latitude-data/constants'
import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import { createIntegration } from '../../../../integrations'
import { UnconfiguredPipedreamIntegrationConfiguration } from '../../../../integrations/helpers/schema'
import { getApp } from '../../../../integrations/pipedream/apps'
import { integrationPresenter } from '../presenters'
import { defineLatteTool } from '../types'

const createIntegrationLatte = defineLatteTool(
  async ({ name, app: appName }, { workspace, user }) => {
    const appResult = await getApp({ name: appName })
    if (!Result.isOk(appResult)) return appResult
    const app = appResult.unwrap()

    const result = await createIntegration({
      name,
      type: IntegrationType.Pipedream,
      configuration: {
        appName: app.name_slug,
        metadata: {
          displayName: app.name,
          imageUrl: app.img_src,
        },
      } as UnconfiguredPipedreamIntegrationConfiguration,
      workspace,
      author: user,
    })

    if (!Result.isOk(result)) return result
    const integration = result.unwrap()
    return Result.ok(integrationPresenter(integration))
  },
  z.object({
    name: z.string(),
    app: z.string(),
  }),
)

export default createIntegrationLatte
