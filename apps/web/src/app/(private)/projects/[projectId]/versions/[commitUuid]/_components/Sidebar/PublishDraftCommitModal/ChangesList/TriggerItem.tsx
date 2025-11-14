import { ChangedTrigger, DocumentTriggerType } from '@latitude-data/constants'
import { useMemo } from 'react'
import React from 'react'
import { ROUTES } from '$/services/routes'
import useDocumentTriggers from '$/stores/documentTriggers'
import useIntegrations from '$/stores/integrations'
import { ListItem } from './ListItem'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
import { ICONS_BY_TRIGGER } from '$/components/TriggersManagement/NewTrigger/IntegrationsList'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { integrationOptions } from '$/lib/integrationTypeOptions'
import Image from 'next/image'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { IntegrationTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { useTriggerLabel } from '$/components/TriggersManagement/hooks/useTriggerLabel'

function NonIntegrationTriggerItem({
  href,
  change,
  trigger,
  label,
}: {
  href: string
  change: ChangedTrigger
  trigger: DocumentTrigger
  label: string
}) {
  return (
    <ListItem
      icon={ICONS_BY_TRIGGER[trigger.triggerType] ?? 'zap'}
      label={label}
      changeType={change.changeType}
      href={href}
    />
  )
}

function IntegrationTriggerItem({
  href,
  change,
  integration,
  label,
}: {
  href: string
  change: ChangedTrigger
  integration: IntegrationDto
  label: string
}) {
  const { icon } = integrationOptions(integration)

  return (
    <ListItem
      icon={
        icon.type === 'icon' ? (
          icon.name
        ) : (
          <Image
            src={icon.src}
            alt={icon.alt}
            width={16}
            height={16}
            unoptimized
          />
        )
      }
      label={label}
      changeType={change.changeType}
      href={href}
    />
  )
}

function LoadingTriggerItem({
  change,
  href,
}: {
  change: ChangedTrigger
  href: string
}) {
  return (
    <ListItem
      icon={<Skeleton className='w-4 h-4' />}
      label={change.triggerType}
      changeType={change.changeType}
      href={href}
    />
  )
}

export function TriggerChangeItem({
  triggerChange,
  projectId,
  commitUuid,
  documentUuid,
}: {
  triggerChange: ChangedTrigger
  projectId: number
  commitUuid: string
  documentUuid: string
}) {
  const href = ROUTES.projects
    .detail({ id: projectId })
    .commits.detail({ uuid: commitUuid }).home.root

  const { data: triggers } = useDocumentTriggers({
    projectId,
    commitUuid,
    documentUuid,
  })
  const { data: integrations } = useIntegrations()

  const trigger = useMemo(() => {
    return triggers.find((t) => t.uuid === triggerChange.triggerUuid)
  }, [triggers, triggerChange.triggerUuid])

  const integration = useMemo(() => {
    if (trigger?.triggerType !== DocumentTriggerType.Integration) {
      return undefined
    }

    const triggerConfig = trigger.configuration as IntegrationTriggerConfiguration // prettier-ignore
    return integrations.find((i) => i.id === triggerConfig.integrationId)
  }, [integrations, trigger])

  const label = useTriggerLabel({
    trigger,
    integrations,
  })

  if (!trigger) {
    return <LoadingTriggerItem change={triggerChange} href={href} />
  }

  if (trigger.triggerType !== DocumentTriggerType.Integration) {
    return (
      <NonIntegrationTriggerItem
        change={triggerChange}
        trigger={trigger}
        label={label}
        href={href}
      />
    )
  }

  if (!integration) {
    return <LoadingTriggerItem change={triggerChange} href={href} />
  }

  return (
    <IntegrationTriggerItem
      change={triggerChange}
      integration={integration}
      label={label}
      href={href}
    />
  )
}
