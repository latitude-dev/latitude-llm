import useIntegrations from '$/stores/integrations'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useCallback, useEffect, useState } from 'react'
import { TriggerTypesSelector } from './TriggerTypeSelector'
import { EmailTriggerConfig } from './Email/Config'
import { ScheduleTriggerConfig } from './Schedule/Config'
import { IntegrationTriggerConfig } from './Integration/Config'
import {
  DocumentTriggerConfiguration,
  IntegrationTriggerConfiguration,
} from '@latitude-data/core/services/documentTriggers/helpers/schema'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'

export function TriggerConfigModal({
  document,
  projectId,
  trigger,
  isOpen,
  onOpenChange,
}: {
  document: DocumentVersion
  projectId: number
  trigger?: DocumentTrigger
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: integrations, isLoading: isLoadingIntegrations } =
    useIntegrations({ withTriggers: true })

  const [selectedType, setSelectedType] = useState<
    DocumentTriggerType | undefined
  >(trigger?.triggerType)

  const [selectedIntegration, setSelectedIntegration] = useState<
    IntegrationDto | undefined
  >()

  const [selectedIntegrationTrigger, setSelectedIntegrationTrigger] = useState<
    PipedreamComponent<PipedreamComponentType.Trigger> | undefined
  >()

  const selectTriggerType = useCallback(
    <T extends DocumentTriggerType>(
      triggerType: DocumentTriggerType,
      integration: T extends DocumentTriggerType.Integration
        ? IntegrationDto
        : undefined,
      component: T extends DocumentTriggerType.Integration
        ? PipedreamComponent<PipedreamComponentType.Trigger>
        : undefined,
    ) => {
      setSelectedType(triggerType)

      if (triggerType === DocumentTriggerType.Integration) {
        setSelectedIntegration(integration)
        setSelectedIntegrationTrigger(component)

        setTriggerConfig({
          integrationId: integration!.id,
          componentId: component!.key,
          properties: {},
        } as IntegrationTriggerConfiguration)
      } else {
        setSelectedIntegration(undefined)
        setSelectedIntegrationTrigger(undefined)
      }
    },
    [],
  )

  const [triggerConfig, setTriggerConfig] = useState<
    DocumentTriggerConfiguration | undefined
  >(trigger?.configuration)

  useEffect(() => {
    if (
      trigger?.triggerType === DocumentTriggerType.Integration &&
      integrations
    ) {
      setSelectedIntegration(
        integrations?.find(
          (i) => i.id === trigger.configuration?.integrationId,
        ),
      )
    }
  }, [trigger, integrations])

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      // Handle form submission

      console.log('CONFIG', triggerConfig)
    },
    [triggerConfig],
  )

  return (
    <Modal
      open={isOpen}
      onOpenChange={onOpenChange}
      size='xl'
      scrollable={false}
      dismissible
      title={trigger ? 'Add new Trigger' : 'Configure Trigger'}
      description={
        trigger
          ? 'Add a new trigger to execute this prompt automatically.'
          : 'Configure the trigger settings for this document.'
      }
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            variant='default'
            type='submit'
            form='triggerConfigForm'
          >
            {trigger ? 'Add Trigger' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className='w-full flex flex-row gap-4 h-auto relative flex-grow min-h-0'>
        <TriggerTypesSelector
          integrations={integrations}
          isLoadingIntegrations={isLoadingIntegrations}
          selectedComponent={selectedIntegrationTrigger}
          selectedType={selectedType}
          selectedIntegration={selectedIntegration}
          onSelect={selectTriggerType}
        />
        <div className='w-px bg-border h-auto' />
        <form
          id='triggerConfigForm'
          className='w-full overflow-auto custom-scrollbar pb-4'
          onSubmit={onSubmit}
        >
          {selectedType === DocumentTriggerType.Email && <EmailTriggerConfig />}
          {selectedType === DocumentTriggerType.Scheduled && (
            <ScheduleTriggerConfig />
          )}
          {selectedType === DocumentTriggerType.Integration && (
            <IntegrationTriggerConfig
              integration={selectedIntegration!}
              component={selectedIntegrationTrigger!}
              config={triggerConfig! as IntegrationTriggerConfiguration}
              setConfig={
                setTriggerConfig as ReactStateDispatch<IntegrationTriggerConfiguration>
              }
            />
          )}
        </form>
      </div>
    </Modal>
  )
}
