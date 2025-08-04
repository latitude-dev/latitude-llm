import useIntegrations from '$/stores/integrations'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
  PipedreamComponent,
  PipedreamComponentType,
  PipedreamIntegration,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import useDocumentTriggers from '$/stores/documentTriggers'
import { TriggerTypeSelector } from './TriggerTypeSelector'
import { IntegrationTriggerConfig } from './IntegrationTriggerConfig'
import { IntegrationTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/browser'

export function TriggerConfigModal({
  document,
  projectId,
  trigger,
  isOpen,
  onOpenChange,
}: {
  document: DocumentVersion
  projectId: number
  trigger?: Extract<
    DocumentTrigger,
    { triggerType: DocumentTriggerType.Integration }
  >
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEditing = Boolean(trigger)

  const { create, update, isCreating, isUpdating } = useDocumentTriggers(
    {
      projectId,
      documentUuid: document.documentUuid,
    },
    {
      onCreated: () => {
        onOpenChange(false)
      },
      onUpdated: () => {
        onOpenChange(false)
      },
    },
  )
  const { data: integrations, isLoading: loadingIntegrations } =
    useIntegrations({ withTriggers: true })

  const [[integration, component], setSelectedPair] = useState<
    | [IntegrationDto, PipedreamComponent<PipedreamComponentType.Trigger>]
    | [undefined, undefined]
  >([undefined, undefined])

  const [configuredProps, setConfiguredProps] = useState<
    ConfiguredProps<ConfigurableProps>
  >({})
  const [payloadParameters, setPayloadParameters] = useState<string[]>([])

  const integrationForTrigger = integrations?.find(
    (i) => i.id === trigger?.configuration?.integrationId,
  )

  const { data: pipedreamData, isLoading: loadingComponents } = usePipedreamApp(
    (integrationForTrigger as PipedreamIntegration | undefined)?.configuration
      .appName,
  )

  useEffect(() => {
    // Auto-select integration and component if editing an existing trigger
    if (!trigger) return
    if (integration || component) return

    if (!integrationForTrigger) return
    if (loadingComponents || !pipedreamData) return

    const triggerConfig =
      trigger.configuration as IntegrationTriggerConfiguration
    const triggerComponent = pipedreamData.triggers.find(
      (t) => t.key === triggerConfig.componentId,
    )

    if (!triggerComponent) return

    setSelectedPair([integrationForTrigger, triggerComponent])
    setConfiguredProps(triggerConfig.properties ?? {})
    setPayloadParameters(triggerConfig.payloadParameters ?? [])
  }, [
    trigger,
    integration,
    component,
    integrationForTrigger,
    loadingComponents,
    pipedreamData,
  ])

  useEffect(() => {
    // Reset state when modal is closed
    if (isOpen) return
    setSelectedPair([undefined, undefined])
    setConfiguredProps({})
  }, [isOpen])

  const handleSelect = useCallback(
    (
      integration: IntegrationDto,
      component: PipedreamComponent<PipedreamComponentType.Trigger>,
    ) => {
      setSelectedPair([integration, component])
      setConfiguredProps({})
    },
    [],
  )

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      if (isCreating || isUpdating) return
      if (!integration || !component) return

      if (trigger) {
        update({
          documentUuid: document.documentUuid,
          documentTrigger: trigger,
          configuration: {
            integrationId: integration.id,
            componentId: component.key,
            properties: configuredProps,
            payloadParameters,
            triggerId: trigger.configuration.triggerId,
          },
        })
        return
      }

      create({
        documentUuid: document.documentUuid,
        trigger: {
          type: DocumentTriggerType.Integration,
          configuration: {
            integrationId: integration.id,
            componentId: component.key,
            properties: configuredProps,
            payloadParameters,
          },
        },
      })
    },
    [
      create,
      update,
      trigger,
      configuredProps,
      payloadParameters,
      integration,
      component,
      isCreating,
      isUpdating,
      document.documentUuid,
    ],
  )

  return (
    <Modal
      open={isOpen}
      onOpenChange={onOpenChange}
      size='xl'
      scrollable={false}
      dismissible
      title={isEditing ? 'Configure Trigger' : 'Add New Trigger'}
      description={
        isEditing
          ? 'Configure the trigger settings for this document.'
          : 'Add a new trigger to execute this prompt automatically.'
      }
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            variant='default'
            type='submit'
            form='triggerConfigForm'
            isLoading={isCreating || isUpdating}
          >
            {isEditing ? 'Save Changes' : 'Add Trigger'}
          </Button>
        </>
      }
    >
      <div className='flex gap-4 h-full min-h-0'>
        <TriggerTypeSelector
          integrations={integrations}
          isLoading={loadingIntegrations}
          selectedIntegration={integration}
          selectedComponent={component}
          onSelect={handleSelect}
        />
        <form
          id='triggerConfigForm'
          className='flex-1 overflow-auto pb-4'
          onSubmit={onSubmit}
        >
          {integration && component && (
            <IntegrationTriggerConfig
              key={component.key}
              document={document}
              integration={integration}
              component={component}
              configuredProps={configuredProps}
              setConfiguredProps={setConfiguredProps}
              payloadParameters={payloadParameters}
              setPayloadParameters={setPayloadParameters}
              disabled={isCreating || isUpdating}
            />
          )}
        </form>
      </div>
    </Modal>
  )
}
