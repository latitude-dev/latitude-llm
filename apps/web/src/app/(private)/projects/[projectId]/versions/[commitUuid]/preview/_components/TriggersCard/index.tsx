import { useMemo } from 'react'
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
import { DocumentTriggerType } from '@latitude-data/constants'
import { humanizeCronValue } from '@latitude-data/web-ui/organisms/CronInput'
import {
  EmailTriggerConfiguration,
  IntegrationTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'
import { ICONS_BY_TRIGGER } from '../../@modal/(.)triggers/new/_components/IntegrationsList'
import { TriggerWrapper } from '../TriggerWrapper'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { OnRunTriggerFn } from '../TriggersList'
import { OnRunChatTrigger } from '../useActiveTrigger'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'

function IntegrationTriggerCard({
  isFirst,
  isLast,
  trigger,
  integrations,
  documentName,
  document,
  openTriggerUuid,
  setOpenTriggerUuid,
  onRunTrigger,
  onRunChatTrigger,
}: {
  trigger: DocumentTrigger<DocumentTriggerType.Integration>
  integrations: IntegrationDto[]
  documentName: string
  document: DocumentVersion
  openTriggerUuid: string | null
  setOpenTriggerUuid: ReactStateDispatch<string | null>
  onRunTrigger: OnRunTriggerFn
  onRunChatTrigger: OnRunChatTrigger
  isFirst?: boolean
  isLast?: boolean
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

  const title = useMemo(() => {
    if (component) return component.name
    return trigger.configuration.componentId
  }, [component, trigger.configuration.componentId])

  if (!integration) return null

  return (
    <TriggerWrapper
      isFirst={isFirst}
      isLast={isLast}
      document={document}
      trigger={trigger}
      title={title}
      subtitle={integration.name}
      description={app ? `Runs ${documentName}` : 'Loading...'}
      descriptionLoading={!app}
      openTriggerUuid={openTriggerUuid}
      setOpenTriggerUuid={setOpenTriggerUuid}
      onRunTrigger={onRunTrigger}
      onRunChatTrigger={onRunChatTrigger}
      image={
        <Image
          src={integration.configuration.metadata?.imageUrl || ''}
          alt={`${integration.name} icon`}
          width={24}
          height={40}
          className='rounded'
          unoptimized
        />
      }
    />
  )
}

function GenericTriggerCard({
  isFirst,
  isLast,
  trigger,
  documentName,
  document,
  openTriggerUuid,
  setOpenTriggerUuid,
  onRunTrigger,
  onRunChatTrigger,
}: {
  trigger: DocumentTrigger
  documentName: string
  document: DocumentVersion
  openTriggerUuid: string | null
  setOpenTriggerUuid: ReactStateDispatch<string | null>
  onRunTrigger: OnRunTriggerFn
  onRunChatTrigger: OnRunChatTrigger
  isFirst?: boolean
  isLast?: boolean
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
      case DocumentTriggerType.Chat:
        title = 'Chat'
        break
      default:
        title = 'Unknown Trigger Type'
    }
    switch (type) {
      case DocumentTriggerType.Scheduled: {
        const config = trigger.configuration as ScheduledTriggerConfiguration
        const humanCron = humanizeCronValue(
          config.cronExpression ?? '* * * * *',
        )
        description = `${humanCron} · ${documentName}`
        break
      }
      case DocumentTriggerType.Email: {
        const config = trigger.configuration as EmailTriggerConfiguration
        const name = config.name
        description = `${name} · ${documentName}`
        break
      }
      case DocumentTriggerType.Chat: {
        description = documentName
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
    <TriggerWrapper
      isFirst={isFirst}
      isLast={isLast}
      document={document}
      trigger={trigger}
      openTriggerUuid={openTriggerUuid}
      setOpenTriggerUuid={setOpenTriggerUuid}
      onRunTrigger={onRunTrigger}
      onRunChatTrigger={onRunChatTrigger}
      title={info.title}
      description={info.description}
      image={<Icon name={info.iconName} size='large' color='foregroundMuted' />}
    />
  )
}

type DocumentWithName = {
  documentName: string
  document: DocumentVersion
}
export function TriggersCard({
  trigger,
  integrations,
  openTriggerUuid,
  setOpenTriggerUuid,
  onRunTrigger,
  onRunChatTrigger,
  isFirst = false,
  isLast = false,
}: {
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
  openTriggerUuid: string | null
  setOpenTriggerUuid: ReactStateDispatch<string | null>
  onRunTrigger: OnRunTriggerFn
  onRunChatTrigger: OnRunChatTrigger
  isFirst?: boolean
  isLast?: boolean
}) {
  const type = trigger.triggerType
  const { commit } = useCurrentCommit()
  const { data: documents } = useDocumentVersions({
    projectId: trigger.projectId,
    commitUuid: commit.uuid,
  })

  const documentWithName = useMemo<DocumentWithName | undefined>(() => {
    if (!documents) return undefined

    const document = documents.find(
      (d) => d.documentUuid === trigger.documentUuid,
    )!
    return {
      documentName: document?.path?.split('/')?.at(-1) ?? '',
      document,
    }
  }, [documents, trigger.documentUuid])

  // Loading documents. Triggers always should have a document linked
  if (!documentWithName) return null

  if (type === DocumentTriggerType.Integration) {
    return (
      <IntegrationTriggerCard
        isFirst={isFirst}
        isLast={isLast}
        trigger={trigger as DocumentTrigger<DocumentTriggerType.Integration>}
        integrations={integrations}
        documentName={documentWithName.documentName}
        document={documentWithName.document}
        openTriggerUuid={openTriggerUuid}
        setOpenTriggerUuid={setOpenTriggerUuid}
        onRunTrigger={onRunTrigger}
        onRunChatTrigger={onRunChatTrigger}
      />
    )
  }

  return (
    <GenericTriggerCard
      isFirst={isFirst}
      isLast={isLast}
      trigger={trigger}
      documentName={documentWithName.documentName}
      document={documentWithName.document}
      openTriggerUuid={openTriggerUuid}
      setOpenTriggerUuid={setOpenTriggerUuid}
      onRunTrigger={onRunTrigger}
      onRunChatTrigger={onRunChatTrigger}
    />
  )
}
