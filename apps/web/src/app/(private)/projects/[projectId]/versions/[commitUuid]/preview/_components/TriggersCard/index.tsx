import { ReactNode, useCallback, useState, useMemo } from 'react'
import useDocumentTriggers from '$/stores/documentTriggers'
import Image from 'next/image'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import useDocumentVersions from '$/stores/documentVersions'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'
import {
  DocumentTrigger,
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/browser'
import { DocumentTriggerType } from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ICONS_BY_TRIGGER } from '../../@modal/(.)triggers/new/_components/IntegrationsList'
import { humanizeCronValue } from '@latitude-data/web-ui/organisms/CronInput'

function DeleteTriggerButton({ trigger }: { trigger: DocumentTrigger }) {
  const { isHead } = useCurrentCommit()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { delete: deleteTrigger, isDeleting } = useDocumentTriggers(
    {
      projectId: trigger.projectId,
    },
    {
      onDeleted: () => setIsModalOpen(false),
    },
  )

  return (
    <>
      <Button
        variant='ghost'
        size='small'
        className='p-0'
        disabled={!isHead || isDeleting}
        onClick={() => setIsModalOpen(true)}
        iconProps={{
          name: 'trash',
        }}
      />
      <ConfirmModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        dismissible={!isDeleting}
        zIndex='popover'
        title='Delete Trigger'
        description='Are you sure you want to delete this trigger? This action cannot be undone.'
        type='destructive'
        onConfirm={useCallback(
          () => deleteTrigger(trigger),
          [deleteTrigger, trigger],
        )}
        onCancel={useCallback(() => setIsModalOpen(false), [setIsModalOpen])}
        confirm={{
          label: 'Delete Trigger',
          disabled: isDeleting,
          isConfirming: isDeleting,
        }}
        cancel={{
          label: 'Cancel',
        }}
      />
    </>
  )
}

export function TriggersCardWrapper({
  image,
  title,
  description,
  descriptionLoading = false,
  trigger,
}: {
  trigger: DocumentTrigger
  title: string
  description: string
  descriptionLoading?: boolean
  image: ReactNode
}) {
  return (
    <div className='w-full p-4 border rounded-lg flex flex-row justify-between items-center gap-4'>
      <div className='flex flex-row items-center gap-4'>
        {image}
        <div className='flex-1 flex flex-col gap-0'>
          <Text.H5>{title}</Text.H5>
          {descriptionLoading ? (
            <Skeleton className='w-24 h-4' />
          ) : (
            <Text.H6 color='foregroundMuted'>{description}</Text.H6>
          )}
        </div>
      </div>
      <DeleteTriggerButton trigger={trigger} />
    </div>
  )
}

function IntegrationTriggerCard({
  trigger,
  integrations,
  documentName,
}: {
  trigger: Extract<
    DocumentTrigger,
    { triggerType: DocumentTriggerType.Integration }
  >
  integrations: IntegrationDto[]
  documentName: string
}) {
  const integration = useMemo(() => {
    if (!integrations) return undefined
    return integrations.find(
      (i) => i.id === trigger.configuration.integrationId,
    ) as PipedreamIntegration | undefined
  }, [integrations, trigger.configuration.integrationId])

  const { data: app } = usePipedreamApp(integration?.configuration.appName)

  const component = useMemo(() => {
    if (!app?.triggers) return undefined
    return app.triggers.find((c) => c.key === trigger.configuration.componentId)
  }, [app, trigger.configuration.componentId])

  if (!integration) return null

  return (
    <TriggersCardWrapper
      trigger={trigger}
      title={component?.name || 'Unknown Trigger'}
      description={app ? `Runs ${documentName}` : 'Loading...'}
      descriptionLoading={!app}
      image={
        <Image
          src={integration.configuration.metadata?.imageUrl || ''}
          alt={`${integration.name} icon`}
          width={40}
          height={40}
          className='rounded'
          unoptimized
        />
      }
    />
  )
}

function NonIntegrationTriggerCard({
  trigger,
  documentName,
}: {
  trigger: DocumentTrigger
  documentName: string
}) {
  const info = useMemo(() => {
    const type = trigger.triggerType
    let title = ''
    let description = ''

    switch (type) {
      case DocumentTriggerType.Scheduled:
        title = 'Schedule'
        break
      case DocumentTriggerType.Email:
        title = 'Email'
        break
      default:
        title = 'Unknown Trigger Type'
    }
    switch (type) {
      case DocumentTriggerType.Scheduled: {
        const humanCron = humanizeCronValue(
          trigger.configuration.cronExpression ?? '* * * * *',
        )
        description = `${humanCron} · ${documentName}`
        break
      }
      case DocumentTriggerType.Email: {
        const name = trigger.configuration.name
        description = `${name} · ${documentName}`
        break
      }
      default:
        description = `Runs ${documentName}`
    }
    const iconName = ICONS_BY_TRIGGER[type] || 'chat'

    return {
      title,
      description,
      iconName,
    }
  }, [trigger, documentName])
  return (
    <TriggersCardWrapper
      trigger={trigger}
      title={info.title}
      description={info.description}
      image={
        <div
          className={cn(
            'size-10 rounded-md bg-backgroundCode flex items-center justify-center',
          )}
        >
          <Icon name={info.iconName} size='large' color='foregroundMuted' />
        </div>
      }
    />
  )
}

export function TriggersCard({
  trigger,
  integrations,
}: {
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
}) {
  const type = trigger.triggerType
  const { data: documents } = useDocumentVersions({
    projectId: trigger.projectId,
  })

  const documentName = useMemo(() => {
    if (!documents) return undefined
    const document = documents.find(
      (d) => d.documentUuid === trigger.documentUuid,
    )
    return document?.path?.split('/')?.at(-1) ?? ''
  }, [documents, trigger.documentUuid])

  if (type === DocumentTriggerType.Integration) {
    return (
      <IntegrationTriggerCard
        trigger={trigger}
        integrations={integrations}
        documentName={documentName!}
      />
    )
  }

  return (
    <NonIntegrationTriggerCard trigger={trigger} documentName={documentName!} />
  )
}
