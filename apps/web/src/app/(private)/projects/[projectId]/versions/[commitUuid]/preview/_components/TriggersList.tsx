'use client'

import useDocumentTriggers from '$/stores/documentTriggers'
import useIntegrations from '$/stores/integrations'
import { DocumentTrigger, IntegrationDto } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { TriggersBlankSlate } from './TriggersBlankSlate'
import { TriggersCard } from './TriggersCard'

export function TriggersList({
  triggers: fallbackData,
  integrations: fallbackIntegrations,
}: {
  triggers: DocumentTrigger[]
  integrations: IntegrationDto[]
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
  const { data: integrations } = useIntegrations({
    fallbackData: fallbackIntegrations,
    withTriggers: true,
  })

  if (triggers.length === 0) return <TriggersBlankSlate />

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
          {triggers.map((trigger) => (
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
