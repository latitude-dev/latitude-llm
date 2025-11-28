import { useEffect, useState } from 'react'
import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/browser'
import { DocumentTriggerType } from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { PipedreamComponentPropsForm } from '$/components/Pipedream/PipedreamPropsForm'
import { useIntegrationData } from './useIntegrationData'
import { useParsedPipedreamTriggerDescription } from '$/components/TriggersManagement/components/TriggerForms/IntegrationTriggerForm/usePipedreamTriggerDescription'
import { SelectPayloadParameters } from '$/components/TriggersManagement/components/TriggerForms/IntegrationTriggerForm/SelectPayloadParameters'
import type { EditTriggerProps } from '../../types'

export function EditIntegrationTrigger({
  trigger,
  document,
  setConfiguration,
  isUpdating,
}: EditTriggerProps<DocumentTriggerType.Integration>) {
  const { isLoading, valid, data, error } = useIntegrationData({
    trigger,
  })
  const triggerDescription = useParsedPipedreamTriggerDescription({
    pipedreamTrigger: valid ? data.pipedreamTrigger : undefined,
  })
  const [payloadParameters, setPayloadParameters] = useState<string[]>(
    trigger.configuration.payloadParameters ?? [],
  )
  const [configuredProps, setConfiguredProps] = useState<
    ConfiguredProps<ConfigurableProps>
  >(trigger.configuration.properties ?? {})

  useEffect(() => {
    if (!valid || isLoading || !valid) return

    setConfiguration({
      integrationId: data.integration.id,
      componentId: data.pipedreamTrigger.key,
      properties: configuredProps,
      payloadParameters,
    })
  }, [
    valid,
    isLoading,
    data?.integration?.id,
    data?.pipedreamTrigger?.key,
    configuredProps,
    payloadParameters,
    setConfiguration,
  ])

  useEffect(() => {
    // Reset payload parameters if the document changes
    if (trigger.documentUuid !== document?.documentUuid) {
      setPayloadParameters([])
    }
  }, [document.documentUuid, trigger.documentUuid])

  if (!valid) {
    return <Text.H5 color='destructive'>{error}</Text.H5>
  }

  return (
    <>
      <div className='bg-backgroundCode flex flex-col border border-border rounded-md p-3'>
        <Text.H4>{data.integration.name}</Text.H4>
        <Text.H5 asChild color='foregroundMuted' display='block'>
          <div
            className='[&>a]:underline [&>a]:text-foreground'
            dangerouslySetInnerHTML={{
              __html: triggerDescription,
            }}
          />
        </Text.H5>
      </div>
      <SelectPayloadParameters
        payloadParameters={payloadParameters}
        setPayloadParameters={setPayloadParameters}
      />
      {isLoading ? (
        <div className='space-y-4'>
          <Skeleton height='h5' className='w-full' />
          <Skeleton height='h5' className='w-full' />
          <Skeleton height='h5' className='w-full' />
          <Skeleton height='h5' className='w-full' />
        </div>
      ) : (
        <PipedreamComponentPropsForm
          key={data.pipedreamTrigger.key}
          integration={data.integration}
          component={data.pipedreamTrigger}
          values={configuredProps}
          onChange={setConfiguredProps}
          disabled={isUpdating}
        />
      )}
    </>
  )
}
