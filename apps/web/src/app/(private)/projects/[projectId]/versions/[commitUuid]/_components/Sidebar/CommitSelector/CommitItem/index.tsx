'use client'

import { MouseEvent, useMemo, useState } from 'react'
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
import useDeploymentTests from '$/stores/deploymentTests'
import { ACTIVE_DEPLOYMENT_STATUSES } from '@latitude-data/core/schema/models/types/DeploymentTest'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import type { CommitTestInfo } from '../ActiveCommitsList'
import { ConfigureTestModal } from './ConfigureTestModal'

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
  // Head commit shows "Live" or "live: <traffic percentage>" if there's an A/B test
  if (isLive) {
    if (testInfo?.type === 'ab' && testInfo.status !== 'paused') {
      const baselineTrafficPercentage = 100 - testInfo.trafficPercentage
      return (
        <Badge variant='accent' className='min-w-0 flex-shrink-0'>
          live: {baselineTrafficPercentage}%
        </Badge>
      )
    }
    return (
      <Badge variant='accent' className='min-w-0 flex-shrink-0'>
        Live
      </Badge>
    )
  }

  // If there's test info for non-head commits, show test badge
  if (testInfo) {
    const isPaused = testInfo.status === 'paused'
    if (testInfo.type === 'shadow') {
      return (
        <Badge variant='purple' className='flex-shrink-0'>
          Shadow test: {isPaused ? 'Paused' : `${testInfo.trafficPercentage}%`}
        </Badge>
      )
    }
    if (testInfo.type === 'ab') {
      // Challenger gets warning badge
      const variant = 'warningMuted'
      return (
        <Badge variant={variant} className='flex-shrink-0'>
          A/B test: {isPaused ? 'Paused' : `${testInfo.trafficPercentage}%`}
        </Badge>
      )
    }
  }

  // Default badge behavior for non-head commits
  const text = commit?.mergedAt ? `v${commit?.version}` : 'Draft'
  return (
    <Badge
      variant={commit?.mergedAt ? 'accent' : 'muted'}
      className='min-w-0 flex-shrink-0'
    >
      {text}
    </Badge>
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

  const hasDraftButtons = isDraft && onCommitPublish && onCommitDelete
  const isCurrentCommit = currentCommit.uuid === commit?.uuid
  const isHeadBaseline =
    commit?.id === headCommitId &&
    testInfo?.type === 'ab' &&
    testInfo?.isBaseline
  const hasTest = !!testInfo && !isHeadBaseline
  const isActiveTest =
    testInfo?.status && ACTIVE_DEPLOYMENT_STATUSES.includes(testInfo.status)
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)

  const { pause, resume, stop } = useDeploymentTests(
    { projectId: project.id, activeOnly: true },
    { revalidateOnMount: false },
  )

  const isPaused = testInfo?.status === 'paused'

  const handlePauseTest = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (testInfo?.testUuid) {
      pause.execute(testInfo.testUuid)
    }
  }

  const handleResumeTest = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (testInfo?.testUuid) {
      resume.execute(testInfo.testUuid)
    }
  }

  const handleStopTest = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (testInfo?.testUuid) {
      stop.execute(testInfo.testUuid)
    }
  }

  if (!commit || !commitPath) return null

  const content = (
    <div className='flex flex-row items-center justify-between gap-4'>
      <div className='flex flex-col gap-2 min-w-0 flex-1'>
        <Text.H5 ellipsis>{commit.title}</Text.H5>
        <div>
          <BadgeCommit
            commit={commit}
            isLive={commit.id === headCommitId}
            testInfo={testInfo}
          />
        </div>
      </div>
      {(hasDraftButtons || hasTest) && (
        <div
          className='flex flex-row items-center gap-x-4'
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onMouseDown={(e) => {
            e.stopPropagation()
          }}
        >
          <div className='flex flex-row items-center gap-4 px-2 py-0 border rounded-xl'>
            {hasTest && (
              <>
                <Tooltip
                  asChild
                  trigger={
                    <Button
                      iconProps={{ name: 'settings', color: 'foregroundMuted' }}
                      variant='nope'
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setIsConfigModalOpen(true)
                      }}
                    />
                  }
                >
                  Configure test
                </Tooltip>
                {isPaused ? (
                  <Tooltip
                    asChild
                    trigger={
                      <Button
                        iconProps={{ name: 'play', color: 'foregroundMuted' }}
                        variant='nope'
                        onClick={handleResumeTest}
                        disabled={resume.isPending}
                      />
                    }
                  >
                    Resume test
                  </Tooltip>
                ) : (
                  <Tooltip
                    asChild
                    trigger={
                      <Button
                        iconProps={{ name: 'pause', color: 'foregroundMuted' }}
                        variant='nope'
                        onClick={handlePauseTest}
                        disabled={pause.isPending}
                      />
                    }
                  >
                    Pause test
                  </Tooltip>
                )}
                {isActiveTest && (
                  <Tooltip
                    asChild
                    trigger={
                      <Button
                        iconProps={{
                          name: 'circleStop',
                          color: 'foregroundMuted',
                        }}
                        variant='nope'
                        onClick={handleStopTest}
                        disabled={stop.isPending}
                      />
                    }
                  >
                    Stop test
                  </Tooltip>
                )}
              </>
            )}
            {hasDraftButtons && !hasTest && (
              <>
                <Tooltip
                  asChild
                  trigger={
                    <Button
                      iconProps={{ name: 'split', color: 'foregroundMuted' }}
                      variant='nope'
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        onCommitPublish?.(commit.id)
                      }}
                    />
                  }
                >
                  Deploy version
                </Tooltip>
                <Tooltip
                  asChild
                  trigger={
                    <Button
                      iconProps={{ name: 'trash', color: 'foregroundMuted' }}
                      variant='nope'
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        onCommitDelete?.(commit.id)
                      }}
                    />
                  }
                >
                  Delete version
                </Tooltip>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )

  const className = cn('flex flex-col p-4 gap-y-2', {
    'bg-accent/50': isCurrentCommit,
  })

  const linkClassName = cn(className, 'hover:bg-muted/50 transition-colors')

  return (
    <>
      {isCurrentCommit ? (
        <div className={className}>{content}</div>
      ) : (
        <Link
          href={commitPath}
          className={linkClassName}
          onClick={(e) => {
            // Prevent navigation if clicking on buttons or their container
            const target = e.target as HTMLElement
            if (
              target.closest('button') ||
              target.closest('[role="button"]') ||
              target.closest('.flex.flex-row.items-center.gap-x-4')
            ) {
              e.preventDefault()
            }
          }}
        >
          {content}
        </Link>
      )}
      {hasTest && testInfo && (
        <ConfigureTestModal
          testInfo={testInfo}
          isOpen={isConfigModalOpen}
          onOpenChange={setIsConfigModalOpen}
        />
      )}
    </>
  )
}

export * from './Skeleton'
