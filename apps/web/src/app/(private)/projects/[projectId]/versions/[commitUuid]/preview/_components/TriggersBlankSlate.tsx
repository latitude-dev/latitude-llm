'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TriggersPreview } from '../../documents/[documentUuid]/_components/DocumentTabs/DocumentTriggers/Settings/IntegrationTriggers/Preview'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'

export function TriggersBlankSlate() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  return (
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
            .commits.detail({ uuid: commit.uuid }).preview.triggers.new.root
        }
      >
        <Button variant='outline' fancy>
          Add trigger
        </Button>
      </Link>
    </div>
  )
}
