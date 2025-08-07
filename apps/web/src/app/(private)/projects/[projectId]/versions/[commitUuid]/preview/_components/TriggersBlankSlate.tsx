'use client'

import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import Link from 'next/link'
import { TriggersPreview } from '../../documents/[documentUuid]/_components/DocumentTabs/DocumentTriggers/Settings/IntegrationTriggers/Preview'

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
