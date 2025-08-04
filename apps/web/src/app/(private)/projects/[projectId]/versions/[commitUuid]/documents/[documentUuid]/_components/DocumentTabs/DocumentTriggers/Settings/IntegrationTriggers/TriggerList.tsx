import useDocumentTriggers from '$/stores/documentTriggers'
import useIntegrations from '$/stores/integrations'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  DocumentTrigger,
  PipedreamComponent,
  PipedreamIntegration,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import Image from 'next/image'
import { useMemo, useState } from 'react'

type IntegrationTrigger = Extract<
  DocumentTrigger,
  { triggerType: DocumentTriggerType.Integration }
>

function DeleteTriggerButton({
  trigger,
  integration,
  component,
}: {
  trigger: IntegrationTrigger
  integration: PipedreamIntegration
  component?: PipedreamComponent
}) {
  const { isHead } = useCurrentCommit()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { delete: deleteTrigger, isDeleting } = useDocumentTriggers(
    {
      documentUuid: trigger.documentUuid,
      projectId: trigger.projectId,
    },
    {
      onDeleted: () => setIsModalOpen(false),
    },
  )

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Button
        variant='ghost'
        className='p-0'
        disabled={!isHead || isDeleting}
        onClick={() => setIsModalOpen(true)}
        iconProps={{
          name: 'trash',
        }}
      />
      <Modal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        dismissible={!isDeleting}
        zIndex='popover'
        title='Delete Trigger'
        description='Are you sure you want to delete this trigger? This action cannot be undone.'
        footer={
          <div className='flex w-full gap-2 items-center justify-end'>
            <Button
              variant='secondary'
              fancy
              onClick={() => setIsModalOpen(false)}
              isLoading={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              fancy
              onClick={() => deleteTrigger(trigger)}
              disabled={isDeleting}
            >
              Delete Trigger
            </Button>
          </div>
        }
      >
        <div className='p-4 bg-destructive-muted rounded flex flex-col gap-2'>
          <div className='flex items-center justify-between'>
            <Text.H5B color='destructiveMutedForeground'>
              {component?.name}
            </Text.H5B>
          </div>
          <div className='flex items-center gap-2'>
            <Image
              src={integration.configuration.metadata?.imageUrl || ''}
              alt={`${integration.name} icon`}
              width={16}
              height={16}
              unoptimized
            />
            <Text.H6 color='destructive'>{integration.name}</Text.H6>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function IntegrationTriggerItem({
  trigger,
  onClick,
}: {
  trigger: IntegrationTrigger
  onClick: () => void
}) {
  const { data: integrations, isLoading: isLoadingIntegrations } =
    useIntegrations()

  const integration = useMemo(() => {
    if (!integrations) return undefined
    return integrations.find(
      (i) => i.id === trigger.configuration.integrationId,
    ) as PipedreamIntegration | undefined
  }, [integrations, trigger.configuration.integrationId])

  const { data: app, isLoading: isLoadingApp } = usePipedreamApp(
    integration?.configuration.appName,
  )

  const component = useMemo(() => {
    if (!app?.triggers) return undefined
    return app.triggers.find((c) => c.key === trigger.configuration.componentId)
  }, [app, trigger.configuration.componentId])

  if (isLoadingIntegrations || isLoadingApp || !integration || !app) {
    return (
      <div className='p-4 bg-muted/50 rounded flex flex-col gap-2'>
        <Skeleton className='w-60' height='h5' />
        <div className='flex items-center gap-2'>
          <Skeleton className='w-6 h-6' />
          <Skeleton className='w-24' height='h6' />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'p-4 bg-muted hover:bg-accent rounded cursor-pointer',
        'flex flex-col gap-2',
      )}
      onClick={onClick}
    >
      <div className='flex items-center justify-between'>
        <Text.H5B>{component?.name}</Text.H5B>
        <DeleteTriggerButton
          trigger={trigger}
          integration={integration}
          component={component}
        />
      </div>
      <div className='flex items-center gap-2'>
        <Image
          src={integration.configuration.metadata?.imageUrl || ''}
          alt={`${integration.name} icon`}
          width={16}
          height={16}
          unoptimized
        />
        <Text.H6 color='foregroundMuted'>{integration.name}</Text.H6>
      </div>
    </div>
  )
}

export function IntegrationTriggerList({
  triggers,
  onOpenTrigger,
}: {
  triggers: IntegrationTrigger[]
  onOpenTrigger: (trigger?: IntegrationTrigger) => void
}) {
  const { isHead } = useCurrentCommit()

  return (
    <div className='flex flex-col gap-2'>
      {triggers.map((trigger) => (
        <IntegrationTriggerItem
          key={trigger.uuid}
          trigger={trigger}
          onClick={() => onOpenTrigger(trigger)}
        />
      ))}
      <Button fancy onClick={() => onOpenTrigger()} disabled={!isHead}>
        Add New Trigger
      </Button>
    </div>
  )
}
