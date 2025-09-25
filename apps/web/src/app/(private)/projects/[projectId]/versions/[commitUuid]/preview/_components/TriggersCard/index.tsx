import { ReactNode, useMemo } from 'react'
import Image from 'next/image'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import useDocumentVersions from '$/stores/documentVersions'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/browser'
import {
  DocumentTriggerType,
  EMAIL_TRIGGER_DOMAIN,
} from '@latitude-data/constants'
import { humanizeCronValue } from '@latitude-data/web-ui/organisms/CronInput'
import {
  EmailTriggerConfiguration,
  IntegrationTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'
import { ICONS_BY_TRIGGER } from '../../@modal/(.)triggers/new/_components/IntegrationsList'
import { TriggerWrapper } from '../TriggerWrapper'
import { OnRunTriggerFn } from '../TriggersList'
import { OnRunChatTrigger } from '../useActiveTrigger'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { CLIENT_TIMEZONE, DEFAULT_TIMEZONE } from '$/lib/constants'

function useTriggerInfo({
  trigger,
  document,
  integrations,
}: {
  trigger: DocumentTrigger
  document: DocumentVersion
  integrations: IntegrationDto[]
}) {
  const integration = useMemo(() => {
    if (!integrations) return undefined
    if (trigger.triggerType !== DocumentTriggerType.Integration) {
      return undefined
    }

    const config = trigger.configuration as IntegrationTriggerConfiguration
    return integrations.find((i) => i.id === config.integrationId) as
      | PipedreamIntegration
      | undefined
  }, [integrations, trigger])

  const { data: app } = usePipedreamApp(integration?.configuration.appName)

  return useMemo<{
    title: string
    image: ReactNode
    description?: string
    integration?: PipedreamIntegration
  }>(() => {
    const iconName = ICONS_BY_TRIGGER[trigger.triggerType] || 'chat'
    const image = <Icon name={iconName} size='large' color='foregroundMuted' />

    if (trigger.triggerType === DocumentTriggerType.Scheduled) {
      const config = trigger.configuration as ScheduledTriggerConfiguration
      const humanCron = humanizeCronValue(config.cronExpression)
      const triggerTimezone = config.timezone ?? DEFAULT_TIMEZONE

      const prefix =
        triggerTimezone === CLIENT_TIMEZONE ? '' : `(${triggerTimezone}) `

      return {
        title: 'Schedule',
        description: prefix + humanCron,
        image,
      }
    }

    if (trigger.triggerType === DocumentTriggerType.Email) {
      const config = trigger.configuration as EmailTriggerConfiguration
      const emailAddress = `${document.documentUuid}@${EMAIL_TRIGGER_DOMAIN}`
      return {
        title: 'Email',
        description: config.name ?? emailAddress,
        image,
      }
    }

    if (trigger.triggerType === DocumentTriggerType.Chat) {
      return {
        title: 'Chat',
        image,
      }
    }

    if (trigger.triggerType === DocumentTriggerType.Integration) {
      const config = trigger.configuration as IntegrationTriggerConfiguration
      const component = app?.triggers.find((c) => c.key === config.componentId)

      const integrationImage = integration?.configuration.metadata?.imageUrl ? (
        <Image
          src={integration.configuration.metadata.imageUrl}
          alt={integration.name}
          width={40}
          height={40}
          unoptimized
        />
      ) : (
        image
      )

      return {
        title: component?.name ?? config.componentId,
        integration,
        image: integrationImage,
      }
    }

    return {
      title: 'Unknown Trigger Type',
      image,
    }
  }, [trigger, document, app, integration])
}

function GenericTriggerCard({
  integrations,
  trigger,
  document,
  isOpen,
  onOpen,
  onRunTrigger,
  onRunChatTrigger,
}: {
  integrations: IntegrationDto[]
  trigger: DocumentTrigger
  document: DocumentVersion
  isOpen: boolean
  onOpen: () => void
  onRunTrigger: OnRunTriggerFn
  onRunChatTrigger: OnRunChatTrigger
}) {
  const { image, title, description, integration } = useTriggerInfo({
    trigger,
    document,
    integrations,
  })

  return (
    <TriggerWrapper
      title={title}
      description={description}
      image={image}
      document={document}
      trigger={trigger}
      integration={integration}
      isOpen={isOpen}
      onOpen={onOpen}
      onRunTrigger={onRunTrigger}
      onRunChatTrigger={onRunChatTrigger}
    />
  )
}

export function TriggersCard({
  trigger,
  integrations,
  openTriggerUuid,
  setOpenTriggerUuid,
  onRunTrigger,
  onRunChatTrigger,
}: {
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
  openTriggerUuid: string | null
  setOpenTriggerUuid: (uuid: string) => void
  onRunTrigger: OnRunTriggerFn
  onRunChatTrigger: OnRunChatTrigger
}) {
  const { commit } = useCurrentCommit()
  const { data: documents } = useDocumentVersions({
    projectId: trigger.projectId,
    commitUuid: commit.uuid,
  })

  const document = useMemo<DocumentVersion | undefined>(
    () => documents?.find((d) => d.documentUuid === trigger.documentUuid),
    [documents, trigger.documentUuid],
  )

  // Loading documents. Triggers always should have a document linked
  if (!document) return null

  return (
    <GenericTriggerCard
      integrations={integrations}
      trigger={trigger}
      document={document}
      isOpen={openTriggerUuid === trigger.uuid}
      onOpen={() => setOpenTriggerUuid(trigger.uuid)}
      onRunTrigger={onRunTrigger}
      onRunChatTrigger={onRunChatTrigger}
    />
  )
}
