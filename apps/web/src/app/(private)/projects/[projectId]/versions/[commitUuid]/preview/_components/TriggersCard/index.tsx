import { useMemo } from 'react'
import Image from 'next/image'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import useDocumentVersions from '$/stores/documentVersions'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'
import type {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/browser'
import { DocumentTriggerType } from '@latitude-data/constants'
import { humanizeCronValue } from '@latitude-data/web-ui/organisms/CronInput'
import type {
  EmailTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'
import { ICONS_BY_TRIGGER } from '../../@modal/(.)triggers/new/_components/IntegrationsList'
import { TriggerWrapper } from '../TriggerWrapper'
import type { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import type { OnRunTriggerFn } from '../TriggersList'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'

function IntegrationTriggerCard({
  trigger,
  integrations,
  documentName,
  document,
  openTriggerUuid,
  setOpenTriggerUuid,
  onRunTrigger,
}: {
  trigger: DocumentTrigger<DocumentTriggerType.Integration>
  integrations: IntegrationDto[]
  documentName: string
  document: DocumentVersion
  openTriggerUuid: string | null
  setOpenTriggerUuid: ReactStateDispatch<string | null>
  onRunTrigger: OnRunTriggerFn
}) {
  const integration = useMemo(() => {
    if (!integrations) return undefined
    return integrations.find((i) => i.id === trigger.configuration.integrationId) as
      | PipedreamIntegration
      | undefined
  }, [integrations, trigger.configuration.integrationId])

  const { data: app } = usePipedreamApp(integration?.configuration.appName)

  const component = useMemo(() => {
    if (!app?.triggers) return undefined
    return app.triggers.find((c) => c.key === trigger.configuration.componentId)
  }, [app, trigger.configuration.componentId])

  if (!integration) return null

  return (
    <TriggerWrapper
      document={document}
      trigger={trigger}
      title={component?.name || 'Unknown Trigger'}
      description={app ? `Runs ${documentName}` : 'Loading...'}
      descriptionLoading={!app}
      openTriggerUuid={openTriggerUuid}
      setOpenTriggerUuid={setOpenTriggerUuid}
      onRunTrigger={onRunTrigger}
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

function GenericTriggerCard({
  trigger,
  documentName,
  document,
  openTriggerUuid,
  setOpenTriggerUuid,
  onRunTrigger,
}: {
  trigger: DocumentTrigger
  documentName: string
  document: DocumentVersion
  openTriggerUuid: string | null
  setOpenTriggerUuid: ReactStateDispatch<string | null>
  onRunTrigger: OnRunTriggerFn
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
        const config = trigger.configuration as ScheduledTriggerConfiguration
        const humanCron = humanizeCronValue(config.cronExpression ?? '* * * * *')
        description = `${humanCron} · ${documentName}`
        break
      }
      case DocumentTriggerType.Email: {
        const config = trigger.configuration as EmailTriggerConfiguration
        const name = config.name
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
    <TriggerWrapper
      document={document}
      trigger={trigger}
      openTriggerUuid={openTriggerUuid}
      setOpenTriggerUuid={setOpenTriggerUuid}
      onRunTrigger={onRunTrigger}
      title={info.title}
      description={info.description}
      image={
        <div
          className={cn('size-10 rounded-md bg-backgroundCode flex items-center justify-center')}
        >
          <Icon name={info.iconName} size='large' color='foregroundMuted' />
        </div>
      }
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
}: {
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
  openTriggerUuid: string | null
  setOpenTriggerUuid: ReactStateDispatch<string | null>
  onRunTrigger: OnRunTriggerFn
}) {
  const type = trigger.triggerType
  const { commit } = useCurrentCommit()
  const { data: documents } = useDocumentVersions({
    projectId: trigger.projectId,
    commitUuid: commit.uuid,
  })

  const documentWithName = useMemo<DocumentWithName | undefined>(() => {
    if (!documents) return undefined

    const document = documents.find((d) => d.documentUuid === trigger.documentUuid)!
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
        trigger={trigger as DocumentTrigger<DocumentTriggerType.Integration>}
        integrations={integrations}
        documentName={documentWithName.documentName}
        document={documentWithName.document}
        openTriggerUuid={openTriggerUuid}
        setOpenTriggerUuid={setOpenTriggerUuid}
        onRunTrigger={onRunTrigger}
      />
    )
  }

  return (
    <GenericTriggerCard
      trigger={trigger}
      documentName={documentWithName.documentName}
      document={documentWithName.document}
      openTriggerUuid={openTriggerUuid}
      setOpenTriggerUuid={setOpenTriggerUuid}
      onRunTrigger={onRunTrigger}
    />
  )
}
