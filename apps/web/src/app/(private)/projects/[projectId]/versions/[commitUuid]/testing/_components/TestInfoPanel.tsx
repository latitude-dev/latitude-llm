'use client'

import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { BlankSlate } from '@latitude-data/web-ui/molecules/BlankSlate'
import { formatDistanceToNow, format } from 'date-fns'
import { MetadataItem } from '$/components/MetadataItem'
import { useCommitsFromProject } from '$/stores/commitsStore'
import { useMemo } from 'react'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { useTestSelection } from './TestSelectionContext'
import { Button } from '@latitude-data/web-ui/atoms/Button'

const STATUS_COLORS: Record<string, string> = {
  pending: 'yellow',
  running: 'blue',
  paused: 'yellow',
  completed: 'secondary',
  cancelled: 'red',
}

const TEST_TYPE_LABELS: Record<string, string> = {
  shadow: '🌑 Shadow Test',
  ab: '🔀 A/B Test',
}

type TestInfoPanelProps = {
  test: DeploymentTest | null
  isLoading?: boolean
  projectId: number
}

export function TestInfoPanel({
  test,
  isLoading,
  projectId,
}: TestInfoPanelProps) {
  const { clearSelection } = useTestSelection()
  const { data: commits, isLoading: isLoadingCommits } =
    useCommitsFromProject(projectId)

  const baselineCommit = useMemo(() => {
    if (!test || !commits) return null
    return commits.find((c) => c.id === test.baselineCommitId) || null
  }, [test, commits])

  const challengerCommit = useMemo(() => {
    if (!test || !commits) return null
    return commits.find((c) => c.id === test.challengerCommitId) || null
  }, [test, commits])

  if (isLoading) {
    return (
      <BlankSlate>
        <LoadingText alignX='center' />
      </BlankSlate>
    )
  }

  if (!test) {
    return (
      <BlankSlate>
        <Text.H4 color='foregroundMuted'>No test selected</Text.H4>
        <Text.H6 color='foregroundMuted'>
          Select a test from the list to view its details
        </Text.H6>
      </BlankSlate>
    )
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-row items-start justify-between gap-4'>
        <div className='flex flex-col gap-2 flex-1 min-w-0'>
          <Text.H4M>{test.name || 'Unnamed Test'}</Text.H4M>
          {test.description && (
            <Text.H6 color='foregroundMuted'>{test.description}</Text.H6>
          )}
        </div>
        <Button
          variant='ghost'
          size='small'
          onClick={clearSelection}
          iconProps={{ name: 'close' }}
        />
      </div>

      <div className='flex flex-col gap-4'>
        <MetadataItem label='Status'>
          <Badge color={STATUS_COLORS[test.status] as any}>{test.status}</Badge>
        </MetadataItem>

        <MetadataItem label='Type'>
          <Text.H6>{TEST_TYPE_LABELS[test.testType]}</Text.H6>
        </MetadataItem>

        {test.testType === 'ab' && test.trafficPercentage !== null && (
          <MetadataItem label='Traffic Percentage'>
            <Text.H6>{test.trafficPercentage}%</Text.H6>
          </MetadataItem>
        )}

        <MetadataItem label='Baseline Version'>
          {isLoadingCommits ? (
            <LoadingText alignX='left' />
          ) : baselineCommit ? (
            <Link
              href={
                ROUTES.projects
                  .detail({ id: projectId })
                  .commits.detail({ uuid: baselineCommit.uuid }).home.root
              }
              target='_blank'
              rel='noopener noreferrer'
            >
              <Text.H6 underline color='primary'>
                {baselineCommit.title || baselineCommit.uuid}
              </Text.H6>
            </Link>
          ) : (
            <Text.H6 color='foregroundMuted'>Version not found</Text.H6>
          )}
        </MetadataItem>

        <MetadataItem label='Challenger Version'>
          {isLoadingCommits ? (
            <LoadingText alignX='left' />
          ) : challengerCommit ? (
            <Link
              href={
                ROUTES.projects
                  .detail({ id: projectId })
                  .commits.detail({ uuid: challengerCommit.uuid }).home.root
              }
              target='_blank'
              rel='noopener noreferrer'
            >
              <Text.H6 underline color='primary'>
                {challengerCommit.title || challengerCommit.uuid}
              </Text.H6>
            </Link>
          ) : (
            <Text.H6 color='foregroundMuted'>Version not found</Text.H6>
          )}
        </MetadataItem>

        <MetadataItem label='Created'>
          <Text.H6>
            {formatDistanceToNow(new Date(test.createdAt), {
              addSuffix: true,
            })}
            {' • '}
            {format(new Date(test.createdAt), 'PPpp')}
          </Text.H6>
        </MetadataItem>

        {test.startedAt && (
          <MetadataItem label='Started'>
            <Text.H6>
              {formatDistanceToNow(new Date(test.startedAt), {
                addSuffix: true,
              })}
              {' • '}
              {format(new Date(test.startedAt), 'PPpp')}
            </Text.H6>
          </MetadataItem>
        )}

        {test.endedAt && (
          <MetadataItem label='Ended'>
            <Text.H6>
              {formatDistanceToNow(new Date(test.endedAt), {
                addSuffix: true,
              })}
              {' • '}
              {format(new Date(test.endedAt), 'PPpp')}
            </Text.H6>
          </MetadataItem>
        )}
      </div>
    </div>
  )
}
