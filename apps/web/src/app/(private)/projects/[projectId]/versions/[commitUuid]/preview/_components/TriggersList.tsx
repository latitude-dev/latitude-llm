'use client'

import { ROUTES } from '$/services/routes'
import useDocumentTriggers from '$/stores/documentTriggers'
import useDocumentVersions from '$/stores/documentVersions'
import useIntegrations from '$/stores/integrations'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  DocumentTrigger,
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

type IntegrationTrigger = Extract<
  DocumentTrigger,
  { triggerType: DocumentTriggerType.Integration }
>

export function TriggersList({
  triggers: fallbackData,
  integrations: fallbackIntegrations,
}: {
  triggers: IntegrationTrigger[]
  integrations: IntegrationTrigger[]
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: triggers } = useDocumentTriggers(
    {
      projectId: project.id,
    },
    {
      fallbackData,
      keepPreviousData: true,
    },
  )
  const integrationTriggers = useMemo(
    () =>
      triggers.filter((t) => t.triggerType === DocumentTriggerType.Integration),
    [triggers],
  )
  const { data: integrations } = useIntegrations({
    fallbackData: fallbackIntegrations,
  })

  return (
    <div className='flex-1 flex flex-col gap-6 items-start justify-start w-full h-full'>
      <div className='flex flex-col gap-4 w-full'>
        <div className='flex flex-col gap-2 items-start justify-start'>
          <Text.H3M>{project.name}</Text.H3M>
          <Text.H5 color='foregroundMuted'>
            Choose a trigger to preview or start chatting with your agent
          </Text.H5>
        </div>
        <div className='flex flex-col gap-4'>
          {integrationTriggers.map((trigger) => (
            <TriggersCard
              key={trigger.uuid}
              trigger={trigger}
              integrations={integrations}
            />
          ))}
        </div>
        <Link
          href={
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: commit.uuid }).preview.triggers.new.root
          }
        >
          <Button variant='outline' fancy>
            Add trigger
          </Button>
        </Link>
      </div>
    </div>
  )
}

function DeleteTriggerButton({ trigger }: { trigger: IntegrationTrigger }) {
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

function TriggersCard({
  trigger,
  integrations,
}: {
  trigger: IntegrationTrigger
  integrations: IntegrationDto[]
}) {
  const { data: documents } = useDocumentVersions({
    projectId: trigger.projectId,
  })

  const document = useMemo(() => {
    if (!documents) return undefined
    return documents.find((d) => d.documentUuid === trigger.documentUuid)
  }, [documents, trigger.documentUuid])

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
    <div className='w-full p-4 border rounded-lg flex flex-row justify-between items-center gap-4'>
      <div className='flex flex-row items-center gap-4'>
        <Image
          src={integration.configuration.metadata?.imageUrl || ''}
          alt={`${integration.name} icon`}
          width={40}
          height={40}
          className='rounded'
          unoptimized
        />
        <div className='flex-1 flex flex-col gap-0'>
          <Text.H5>{component?.name}</Text.H5>
          {app ? (
            <Text.H6 color='foregroundMuted'>
              {app.name} - Runs {document?.path?.split('/').at(-1) ?? ''}
            </Text.H6>
          ) : (
            <Skeleton className='w-24 h-4' />
          )}
        </div>
      </div>
      <DeleteTriggerButton trigger={trigger} />
    </div>
  )
}
