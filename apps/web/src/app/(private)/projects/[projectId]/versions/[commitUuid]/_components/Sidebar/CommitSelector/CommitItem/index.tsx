'use client'
import { useMemo } from 'react'

import { ROUTES } from '$/services/routes'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import {
  DocumentVersion,
  User,
  type Commit,
} from '@latitude-data/core/schema/types'
import { HEAD_COMMIT } from '@latitude-data/core/constants'

export type SimpleUser = Omit<User, 'encryptedPassword'>

export enum BadgeType {
  Head = 'head',
  Draft = 'draft',
  Merged = 'merged',
}

export function BadgeCommit({
  commit,
  isLive,
}: {
  commit?: Commit
  isLive: boolean
}) {
  const text = isLive
    ? 'Live'
    : commit?.mergedAt
      ? `v${commit?.version}`
      : 'Draft'
  return (
    <Badge
      variant={commit?.mergedAt ? 'accent' : 'muted'}
      className='flex-shrink-0'
    >
      {text}
    </Badge>
  )
}

export function CommitItem({
  commit,
  currentDocument,
  headCommitId,
  user,
  onCommitPublish,
  onCommitDelete,
}: {
  commit?: Commit
  currentDocument?: DocumentVersion
  headCommitId?: number
  user?: SimpleUser
  onCommitPublish?: ReactStateDispatch<number | null>
  onCommitDelete?: ReactStateDispatch<number | null>
}) {
  const { project } = useCurrentProject()
  const { commit: currentCommit } = useCurrentCommit()
  const selectedSegment = useSelectedLayoutSegment()
  const isHead = commit?.id === headCommitId
  const isDraft = !commit?.mergedAt
  const commitPath = useMemo(() => {
    if (!commit) return null

    const commitRoute = ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: isHead ? HEAD_COMMIT : commit.uuid })
    if (!currentDocument) return commitRoute.root

    const documentRoute = commitRoute.documents.detail({
      uuid: currentDocument.documentUuid,
    })

    if (!selectedSegment) return documentRoute.editor.root

    return (
      documentRoute[selectedSegment as 'editor' | 'logs']?.root ??
      documentRoute.editor.root
    )
  }, [project.id, commit, isHead, currentDocument, selectedSegment])

  if (!commit || !commitPath) return null

  return (
    <div
      className={cn('flex flex-col p-4 gap-y-2', {
        'bg-accent/50': commit.id === currentCommit.id,
      })}
    >
      <div className='flex flex-col gap-y-1'>
        <div className='flex items-center justify-between'>
          <Text.H5>{commit.title}</Text.H5>
          <BadgeCommit commit={commit} isLive={commit.id === headCommitId} />
        </div>
        <Text.H6 color='foregroundMuted'>
          {user ? user.name : 'Unknown user'}
        </Text.H6>
      </div>
      <div className='flex flex-row items-center gap-x-4'>
        {currentCommit.uuid !== commit.uuid && (
          <Link href={commitPath}>
            <Button variant='link' size='none'>
              View
            </Button>
          </Link>
        )}
        {isDraft && onCommitPublish && onCommitDelete ? (
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

export * from './Skeleton'
