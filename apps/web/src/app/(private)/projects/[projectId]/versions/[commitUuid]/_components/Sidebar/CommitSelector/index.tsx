'use client'

import { RefObject, useEffect, useMemo, useRef, useState } from 'react'

import {
  HEAD_COMMIT,
  HELP_CENTER,
  User,
  type Commit,
} from '@latitude-data/core/browser'
import {
  Badge,
  Button,
  ReactStateDispatch,
  SelectContent,
  SelectRoot,
  SelectTrigger,
  SelectValueWithIcon,
  Text,
  useCurrentProject,
} from '@latitude-data/web-ui'
import PublishDraftCommitModal from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/_components/Sidebar/PublishDraftCommitModal'
import { ROUTES } from '$/services/routes'
import useCommits from '$/stores/commitsStore'
import useUsers from '$/stores/users'
import { useRouter } from 'next/navigation'

import CreateDraftCommitModal from './CreateDraftCommitModal'
import DeleteDraftCommitModal from './DeleteDraftCommitModal'

const MIN_WIDTH_SELECTOR_PX = 380
const TRIGGER_X_PADDING_PX = 26
enum BadgeType {
  Head = 'head',
  Draft = 'draft',
  Merged = 'merged',
}

function useObserveSelectWidth(ref: RefObject<HTMLButtonElement>) {
  const [width, setWidth] = useState(MIN_WIDTH_SELECTOR_PX)
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

  return width
}

function CommitSelectorHeader({
  setOpen,
}: {
  setOpen: ReactStateDispatch<boolean>
}) {
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
    </>
  )
}

function BadgeCommit({ badgeType }: { badgeType: BadgeType }) {
  const isLive = badgeType === BadgeType.Head
  const text = isLive ? 'Live' : badgeType === BadgeType.Draft ? 'Draft' : 'Old'
  return <Badge variant={isLive ? 'accent' : 'muted'}>{text}</Badge>
}

type SimpleUser = Omit<User, 'encryptedPassword'>

function CommitItem({
  commit,
  headCommitId,
  user,
  onCommitPublish,
  onCommitDelete,
}: {
  commit: Commit
  headCommitId: number
  user: SimpleUser | undefined
  onCommitPublish: ReactStateDispatch<number | null>
  onCommitDelete: ReactStateDispatch<number | null>
}) {
  const isHead = commit.id === headCommitId
  const isDraft = !commit.mergedAt
  const { project } = useCurrentProject()
  const router = useRouter()
  const badgeType =
    commit.id === headCommitId ? BadgeType.Head : BadgeType.Draft
  const commitPath = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: isHead ? HEAD_COMMIT : commit.uuid }).root
  return (
    <div className='flex flex-col p-4 gap-y-2'>
      <div className='flex flex-col gap-y-1'>
        <div className='flex items-center justify-between'>
          <Text.H5>{commit.title}</Text.H5>
          <BadgeCommit badgeType={badgeType} />
        </div>
        <Text.H6 color='foregroundMuted'>
          {user ? user.name : 'Unknown user'}
        </Text.H6>
      </div>
      <div className='flex gap-x-4'>
        <Button
          variant='link'
          size='none'
          onClick={() => router.push(commitPath)}
        >
          View
        </Button>
        {isDraft ? (
          <>
            <Button
              variant='link'
              size='none'
              onClick={() => onCommitPublish(commit.id)}
            >
              Publish
            </Button>
            <Button
              variant='link'
              size='none'
              onClick={() => onCommitDelete(commit.id)}
            >
              Delete
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default function CommitSelector({
  headCommit,
  currentCommit,
  draftCommits,
}: {
  headCommit: Commit
  currentCommit: Commit
  draftCommits: Commit[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const width = useObserveSelectWidth(ref)
  const { data: users } = useUsers()
  const usersById = useMemo(() => {
    return users.reduce(
      (acc, user) => {
        acc[user.id] = user
        return acc
      },
      {} as Record<string, SimpleUser>,
    )
  }, [users])
  const { data: commits } = useCommits({ fallbackData: draftCommits })
  const selected = useMemo(() => {
    const foundCommit = commits.find((commit) => commit.id === currentCommit.id)
    const commit = foundCommit ?? currentCommit
    return {
      commit,
      title: commit.title ?? commit.uuid,
      badgeType:
        currentCommit?.id === headCommit.id
          ? BadgeType.Head
          : foundCommit
            ? BadgeType.Draft
            : BadgeType.Merged,
    }
  }, [commits, currentCommit.id, headCommit.id])
  const [publishCommit, setPublishCommit] = useState<number | null>(null)
  const [deleteCommit, setDeleteCommit] = useState<number | null>(null)
  return (
    <>
      <SelectRoot value={String(currentCommit.id)}>
        <SelectTrigger ref={ref}>
          <SelectValueWithIcon
            icon={<BadgeCommit badgeType={selected.badgeType} />}
          >
            <Text.H5M ellipsis noWrap userSelect={false}>
              {selected.title}
            </Text.H5M>
          </SelectValueWithIcon>
        </SelectTrigger>
        <SelectContent autoScroll={false}>
          <div className='flex flex-col gap-y-4 p-4'>
            <div style={{ width, minWidth: MIN_WIDTH_SELECTOR_PX }}>
              <CommitSelectorHeader setOpen={setOpen} />
            </div>
            <ul className='custom-scrollbar max-h-60 border border-border rounded-md divide-y divide-border'>
              <CommitItem
                commit={headCommit}
                headCommitId={headCommit.id}
                user={usersById[headCommit.userId]}
                onCommitPublish={setPublishCommit}
                onCommitDelete={setDeleteCommit}
              />
              {commits.map((commit) => (
                <li key={commit.id}>
                  <CommitItem
                    commit={commit}
                    headCommitId={headCommit.id}
                    user={usersById[commit.userId]}
                    onCommitPublish={setPublishCommit}
                    onCommitDelete={setDeleteCommit}
                  />
                </li>
              ))}
            </ul>
          </div>
        </SelectContent>
      </SelectRoot>
      <CreateDraftCommitModal open={open} setOpen={setOpen} />
      <DeleteDraftCommitModal
        commitId={deleteCommit}
        onClose={setDeleteCommit}
      />
      <PublishDraftCommitModal
        commitId={publishCommit}
        onClose={setPublishCommit}
      />
    </>
  )
}
