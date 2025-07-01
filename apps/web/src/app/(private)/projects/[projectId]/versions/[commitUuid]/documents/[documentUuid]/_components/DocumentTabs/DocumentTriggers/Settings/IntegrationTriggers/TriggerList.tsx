import useIntegrations from '$/stores/integrations'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  DocumentTrigger,
  PipedreamIntegration,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import Image from 'next/image'
import { useMemo } from 'react'

type IntegrationTrigger = Extract<
  DocumentTrigger,
  { triggerType: DocumentTriggerType.Integration }
>

function IntegrationTriggerItem({
  trigger,
  // onOpen,
}: {
  trigger: IntegrationTrigger
  onOpen: () => void
}) {
  const { data: integrations, isLoading: isLoadingIntegrations } =
    useIntegrations()
  const integration = useMemo(() => {
    return integrations.find(
      (i) => i.id === trigger.configuration.integrationId,
    ) as PipedreamIntegration | undefined
  }, [integrations, trigger.configuration.integrationId])

  const { data: app, isLoading: isLoadingApp } = usePipedreamApp(
    integration?.configuration.appName,
  )

  const component = useMemo(() => {
    if (!app) return undefined
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
      // onClick={onOpen} // TODO(triggers): Enable this when trigger updates are implemented
    >
      <Text.H5B>{component?.name}</Text.H5B>
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
  return (
    <div className='flex flex-col gap-2'>
      {triggers.map((trigger) => (
        <IntegrationTriggerItem
          key={trigger.uuid}
          trigger={trigger}
          onOpen={() => onOpenTrigger(trigger)}
        />
      ))}
      <Button fancy onClick={() => onOpenTrigger()}>
        Add New Trigger
      </Button>
    </div>
  )
}
