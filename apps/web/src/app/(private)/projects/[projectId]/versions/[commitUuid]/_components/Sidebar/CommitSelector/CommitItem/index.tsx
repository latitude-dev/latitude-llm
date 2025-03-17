'use client'

import { useMemo } from 'react'

import {
  DocumentVersion,
  HEAD_COMMIT,
  User,
  type Commit,
} from '@latitude-data/core/browser'
import {
  Badge,
  Button,
  cn,
  ReactStateDispatch,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'

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
  return <Badge variant={commit?.mergedAt ? 'accent' : 'muted'}>{text}</Badge>
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

  if (!commit) return null

  const isHead = commit.id === headCommitId
  const isDraft = !commit.mergedAt

  const commitPath = useMemo(() => {
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
  }, [project.id, commit.uuid, isHead, currentDocument, selectedSegment])

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
