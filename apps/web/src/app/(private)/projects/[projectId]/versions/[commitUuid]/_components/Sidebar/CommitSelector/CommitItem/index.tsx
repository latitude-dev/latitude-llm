'use client'

import { useMemo } from 'react'

import { ROUTES } from '$/services/routes'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { HEAD_COMMIT } from '@latitude-data/core/constants'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { User } from '@latitude-data/core/schema/models/types/User'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import type { CommitTestInfo } from '../ActiveCommitsList'
export type SimpleUser = Omit<User, 'encryptedPassword'>

export enum BadgeType {
  Head = 'head',
  Draft = 'draft',
  Merged = 'merged',
}

export function BadgeCommit({
  commit,
  isLive,
  testInfo,
}: {
  commit?: Commit
  isLive: boolean
  testInfo?: CommitTestInfo | null
}) {
  // If there's test info, show test badge
  if (testInfo) {
    if (testInfo.type === 'shadow') {
      return (
        <Badge variant='purple' className='flex-shrink-0'>
          Shadow test
        </Badge>
      )
    }
    if (testInfo.type === 'ab') {
      // Head commit (baseline) gets default badge, draft (challenger) gets warning
      const variant = testInfo.isBaseline ? 'outlineAccent' : 'warningMuted'
      return (
        <Badge variant={variant} className='flex-shrink-0'>
          A/B test: {testInfo.trafficPercentage}%
        </Badge>
      )
    }
  }

  // Default badge behavior (when not in a test)
  // Head commit shows "Live" if not in a test, otherwise it would have testInfo
  const text = isLive
    ? 'Live'
    : commit?.mergedAt
      ? `v${commit?.version}`
      : 'Draft'
  return (
    <div>
      <Badge
        variant={commit?.mergedAt ? 'accent' : 'muted'}
        className='min-w-0 flex-shrink-0'
      >
        {text}
      </Badge>
    </div>
  )
}

export function CommitItem({
  commit,
  currentDocument,
  headCommitId,
  testInfo,
  onCommitPublish,
  onCommitDelete,
}: {
  commit?: Commit
  currentDocument?: DocumentVersion
  headCommitId?: number
  testInfo?: CommitTestInfo | null
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

  const hasViewButton = currentCommit.uuid !== commit.uuid
  const hasDraftButtons = isDraft && onCommitPublish && onCommitDelete
  const hasAnyButton = hasViewButton || hasDraftButtons

  return (
    <div
      className={cn('flex flex-col p-4 gap-y-2', {
        'bg-accent/50': commit.id === currentCommit.id,
      })}
    >
      <div className='flex flex-row items-center justify-between'>
        <div className='flex flex-col gap-2'>
          <Text.H5>{commit.title}</Text.H5>
          <BadgeCommit
            commit={commit}
            isLive={commit.id === headCommitId}
            testInfo={testInfo}
          />
        </div>
        {hasAnyButton && (
          <div className='flex flex-row items-center gap-x-4'>
            <div className='flex flex-row items-center gap-4 px-2 py-0 border rounded-xl'>
              {hasViewButton && (
                <Tooltip
                  asChild
                  trigger={
                    <Link href={commitPath}>
                      <Button
                        iconProps={{
                          name: 'arrowRight',
                          color: 'foregroundMuted',
                        }}
                        variant='nope'
                      />
                    </Link>
                  }
                >
                  view version
                </Tooltip>
              )}
              {hasDraftButtons && (
                <>
                  <Tooltip
                    asChild
                    trigger={
                      <Button
                        iconProps={{ name: 'repeat', color: 'foregroundMuted' }}
                        variant='nope'
                        onClick={() => onCommitPublish(commit.id)}
                      />
                    }
                  >
                    publish version
                  </Tooltip>
                  <Tooltip
                    asChild
                    trigger={
                      <Button
                        iconProps={{ name: 'trash', color: 'foregroundMuted' }}
                        variant='nope'
                        onClick={() => onCommitDelete(commit.id)}
                      />
                    }
                  >
                    delete version
                  </Tooltip>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export * from './Skeleton'
