import { IntegrationConnectionForm } from './integration-connection-form'
import { TriggerConfigurationForm } from './trigger-configuration-form'
import useIntegrations from '$/stores/integrations'
import { useTriggersModalContext } from '../contexts/triggers-modal-context'

export function Column3() {
  const { selectedIntegration, selectedPipedreamApp } = useTriggersModalContext()
  const { data: integrations } = useIntegrations({ withTriggers: true })
  const integration = integrations?.find((i) => i.id === selectedIntegration?.id)

  if (!selectedIntegration?.pipedream?.trigger) return null

  return (
    <div className='flex flex-col space-y-2 p-4 border rounded-lg h-full pb-4 custom-scrollbar'>
      {!integration && selectedPipedreamApp && (
        <IntegrationConnectionForm app={selectedPipedreamApp} />
      )}
      {integration && (
        <TriggerConfigurationForm
          integration={integration}
          triggerComponent={selectedIntegration.pipedream.trigger}
        />
      )}
    </div>
  )
}
