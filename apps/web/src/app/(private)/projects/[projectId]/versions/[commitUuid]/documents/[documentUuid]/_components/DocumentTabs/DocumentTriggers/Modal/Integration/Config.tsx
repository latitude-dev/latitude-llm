import { PipedreamComponentPropsForm } from '$/components/Pipedream/PipedreamPropsForm'
import {
  IntegrationDto,
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/browser'
import { IntegrationTriggerConfiguration } from '@latitude-data/core/services/documentTriggers/helpers/schema'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/browser'
import { useCallback } from 'react'

export function IntegrationTriggerConfig({
  integration,
  component,
  config,
  setConfig,
}: {
  integration: IntegrationDto
  component: PipedreamComponent<PipedreamComponentType.Trigger>
  config: IntegrationTriggerConfiguration
  setConfig: ReactStateDispatch<IntegrationTriggerConfiguration>
}) {
  const onChangeProps = useCallback(
    (newProps: ConfiguredProps<ConfigurableProps>) =>
      setConfig((oldConfig) => ({
        ...oldConfig,
        integrationId: integration.id,
        componentId: component.key,
        properties: newProps,
      })),
    [setConfig, integration.id, component.key],
  )

  return (
    <PipedreamComponentPropsForm
      key={component.key}
      integration={integration}
      component={component}
      values={config.properties ?? {}}
      onChange={onChangeProps}
    />
  )
}
