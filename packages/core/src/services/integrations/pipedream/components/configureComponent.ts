import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/server'
import { IntegrationDto } from '../../../../schema/models/types/Integration'
import { IntegrationType } from '@latitude-data/constants'
import { Result } from '../../../../lib/Result'
import { NotFoundError } from '@latitude-data/constants/errors'
import { getPipedreamClient } from '../apps'
import { isIntegrationConfigured } from './reloadComponentProps'
import { fillConfiguredProps } from './fillConfiguredProps'

export async function configureComponent({
  integration,
  componentId,
  propName,
  configuredProps: configuredClientProps,
}: {
  integration: Extract<IntegrationDto, { type: IntegrationType.Pipedream }>
  componentId: string
  propName: string
  configuredProps?: ConfiguredProps<ConfigurableProps>
}) {
  if (!isIntegrationConfigured(integration)) {
    return Result.error(
      new NotFoundError(
        `Integration '${integration.name}' has not been configured.`,
      ),
    )
  }

  const pipedreamResult = getPipedreamClient()
  if (!Result.isOk(pipedreamResult)) return pipedreamResult
  const pipedream = pipedreamResult.unwrap()

  const externalUserId = integration.configuration.externalUserId

  const configuredPropsResult = await fillConfiguredProps({
    pipedream,
    integration,
    componentId,
    configuredProps: configuredClientProps ?? {},
  })
  if (!Result.isOk(configuredPropsResult)) return configuredPropsResult
  const configuredProps = configuredPropsResult.unwrap()

  try {
    // TODO - Add pagination possibilities, then start using prevContext, query, and page
    const response = await pipedream.components.configureProp({
      id: componentId,
      externalUserId,
      propName,
      configuredProps,
    })

    return Result.ok(response)
  } catch (error) {
    return Result.error(error as Error)
  }
}
