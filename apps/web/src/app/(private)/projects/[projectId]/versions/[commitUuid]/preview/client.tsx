'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { LatteLayout } from '$/components/LatteLayout'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { TriggersPreview } from '../documents/[documentUuid]/_components/DocumentTabs/DocumentTriggers/Settings/IntegrationTriggers/Preview'
import { ROUTES } from '$/services/routes'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import Link from 'next/link'
import useDocumentTriggers from '$/stores/documentTriggers'
import { TriggersList } from './triggers/_components/TriggersList'
import { useMemo } from 'react'
import { DocumentTriggerType } from '@latitude-data/constants'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'

export function Client() {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { data: triggers, isLoading } = useDocumentTriggers({
    projectId: project.id,
  })
  const integrationTriggers = useMemo(
    () =>
      triggers.filter((t) => t.triggerType === DocumentTriggerType.Integration),
    [triggers],
  )

  return (
    <div className='flex-1 min-h-0'>
      <LatteLayout>
        <div className='flex flex-col h-full p-4'>
          {isLoading ? (
            <TableSkeleton cols={3} rows={10} />
          ) : integrationTriggers.length > 0 ? (
            <TriggersList />
          ) : (
            <div className='flex flex-col items-center justify-center h-full gap-8'>
              <div className='flex flex-col gap-2 max-w-[75%]'>
                <Text.H4M centered>{project.name}</Text.H4M>
                <Text.H5 centered color='foregroundMuted'>
                  Add triggers to run this project from a chat box, an event, a
                  schedule…
                </Text.H5>
              </div>
              <TriggersPreview />
              <Link
                href={
                  ROUTES.projects
                    .detail({ id: project.id })
                    .commits.detail({ uuid: commit.uuid }).preview.triggers.new
                    .root
                }
              >
                <Button variant='outline' fancy>
                  Add trigger
                </Button>
              </Link>
            </div>
          )}
        </div>
      </LatteLayout>
    </div>
  )
}
