'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { YoutubeVideoModal } from '@latitude-data/web-ui/molecules/YoutubeVideoModal'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { useToggleModal } from '$/hooks/useToogleModal'
import { RunSourceGroup } from '@latitude-data/constants'
import {
  useLocalStorage,
  AppLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { PlaceholderTable } from './PlaceholderTable'
import { WHAT_ARE_ANNOTATIONS_VIDEO_ID } from '@latitude-data/constants/issues'

function LockedIssuesHeader({
  isLocked,
  projectId,
  commitUuid,
}: {
  isLocked: boolean
  projectId: number
  commitUuid: string
}) {
  const { value: lastRunTab } = useLocalStorage<RunSourceGroup>({
    key: AppLocalStorage.lastRunTab,
    defaultValue: RunSourceGroup.Playground,
  })
  const { open, onOpen, onOpenChange } = useToggleModal()
  const runsRoute = ROUTES.projects
    .detail({ id: projectId })
    .commits.detail({ uuid: commitUuid })
    .annotations.root({ sourceGroup: lastRunTab })
  return (
    <div className='flex flex-col max-w-md justify-center items-center gap-4 mx-auto'>
      <div className='flex flex-col items-center gap-2'>
        <Text.H3M>
          {isLocked
            ? "You don't have access to issues...yet"
            : 'Your project does not have any issues'}
        </Text.H3M>
        <Text.H5 color='foregroundMuted' align='center'>
          Annotate more logs to unlock the issue section and automate the
          evaluation process
        </Text.H5>
      </div>
      <div className='flex items-center justify-center gap-x-2'>
        <Link href={runsRoute}>
          <Button fancy>Annotate logs</Button>
        </Link>
        <Button fancy variant='outline' onClick={onOpen}>
          Learn more
        </Button>
      </div>
      {open ? (
        <YoutubeVideoModal
          open={open}
          onOpenChange={onOpenChange}
          videoId={WHAT_ARE_ANNOTATIONS_VIDEO_ID}
          autoPlay
        />
      ) : null}
    </div>
  )
}

export function LockedIssuesDashboard({
  isLocked,
  projectId,
  commitUuid,
}: {
  isLocked: boolean
  projectId: number
  commitUuid: string
}) {
  return (
    <div className='flex flex-col items-center w-full px-20'>
      <div className='max-w-[680px] flex flex-col w-full gap-8 pt-20 xl:pt-40'>
        <LockedIssuesHeader
          isLocked={isLocked}
          projectId={projectId}
          commitUuid={commitUuid}
        />
        <PlaceholderTable />
      </div>
    </div>
  )
}
