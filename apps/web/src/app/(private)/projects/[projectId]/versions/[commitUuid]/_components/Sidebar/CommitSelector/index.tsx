'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { HELP_CENTER, type Commit } from '@latitude-data/core/browser'
import {
  Badge,
  Button,
  SelectContent,
  SelectRoot,
  SelectTrigger,
  SelectValueWithIcon,
  Text,
} from '@latitude-data/web-ui'
import NewDraftCommitModal from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/_components/Sidebar/CommitSelector/NewDraftCommitModal'
import useCommits from '$/stores/commitsStore'

const MIN_WIDTH_SELECTOR_PX = 380
const TRIGGER_X_PADDING_PX = 26
enum BadgeType {
  Head = 'head',
  Draft = 'draft',
  Merged = 'merged',
}

function CommitSelectorHeader() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className='flex flex-col gap-y-4'>
        <div className='flex flex-row items-center justify-between'>
          <Text.H4M>Versions</Text.H4M>
          <Button variant='outline' onClick={() => setOpen(true)}>
            New version
          </Button>
        </div>
        <Text.H6 color='foregroundMuted'>
          If you have any problem or suggestion Versions allow you to stage
          changes ahead of release.
          <Text.H6 asChild color='accentForeground'>
            <a href={HELP_CENTER.commitVersions} target='_blank'>
              Learn more
            </a>
          </Text.H6>{' '}
          .
        </Text.H6>
      </div>
      <NewDraftCommitModal open={open} setOpen={setOpen} />
    </>
  )
}

function BadgeCommit({ badgeType }: { badgeType: BadgeType }) {
  const isLive = badgeType === BadgeType.Head
  const text = isLive ? 'Live' : badgeType === BadgeType.Draft ? 'Draft' : 'Old'
  return <Badge variant={isLive ? 'accent' : 'muted'}>{text}</Badge>
}

export default function CommitSelector({
  headCommitId,
  currentCommit,
  draftCommits,
}: {
  headCommitId: number
  currentCommit: Commit
  draftCommits: Commit[]
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [width, setWidth] = useState(MIN_WIDTH_SELECTOR_PX)
  const { data: commits } = useCommits({ fallbackData: draftCommits })
  const selected = useMemo(() => {
    const foundCommit = commits.find((commit) => commit.id === currentCommit.id)
    const commit = foundCommit ?? currentCommit
    return {
      commit,
      title: commit.title ?? commit.uuid,
      badgeType:
        currentCommit?.id === headCommitId
          ? BadgeType.Head
          : foundCommit
            ? BadgeType.Draft
            : BadgeType.Merged,
    }
  }, [commits, currentCommit.id, headCommitId])
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const { width: triggerWidth } = entries[0]?.contentRect ?? { width: 0 }
      setWidth(
        Math.max(triggerWidth + TRIGGER_X_PADDING_PX, MIN_WIDTH_SELECTOR_PX),
      )
    })
    if (ref.current) {
      resizeObserver.observe(ref.current)
    }
    return () => {
      resizeObserver.disconnect()
    }
  }, [ref])

  return (
    <SelectRoot value={String(currentCommit.id)}>
      <SelectTrigger ref={ref}>
        <SelectValueWithIcon
          icon={<BadgeCommit badgeType={selected.badgeType} />}
        >
          <Text.H5M>{selected.title}</Text.H5M>
        </SelectValueWithIcon>
      </SelectTrigger>
      <SelectContent>
        <div className='p-2' style={{ width, minWidth: MIN_WIDTH_SELECTOR_PX }}>
          <CommitSelectorHeader />
        </div>
      </SelectContent>
    </SelectRoot>
  )
}
