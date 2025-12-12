'use client'

import { useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCommits } from '$/stores/commitsStore'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDeploymentTests from '$/stores/deploymentTests'

import { CommitItem, CommitItemSkeleton } from './CommitItem'
import { CommitItemsWrapper } from './CommitItemsWrapper'
import { getCommitTestInfo } from './ActiveCommitsList'

import { CommitStatus } from '@latitude-data/core/constants'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'
export function ArchivedCommitsList({
  currentDocument,
  headCommit,
  activeTests: serverActiveTests,
}: {
  currentDocument?: DocumentVersion
  headCommit?: Commit
  activeTests: DeploymentTest[]
}) {
  const { project } = useCurrentProject()
  const { data: storeActiveTests } = useDeploymentTests(
    { projectId: project.id, activeOnly: true },
    { fallbackData: serverActiveTests },
  )

  const activeTests = storeActiveTests

  const { data, isLoading } = useCommits({
    commitStatus: CommitStatus.Merged,
  })

  const commits = useMemo(
    () => data.filter((c) => c.id != headCommit?.id),
    [data, headCommit],
  )

  if (isLoading) {
    return (
      <CommitItemsWrapper>
        {Array.from({ length: 2 }).map((_, i) => (
          <CommitItemSkeleton key={i} />
        ))}
      </CommitItemsWrapper>
    )
  }

  if (!commits?.length) {
    return (
      <Text.H6 color='foregroundMuted'>
        There are no archived versions on this project yet.
      </Text.H6>
    )
  }

  return (
    <CommitItemsWrapper>
      {commits.map((commit) => {
        const testInfo = getCommitTestInfo(
          commit.id,
          headCommit?.id,
          activeTests,
        )
        return (
          <li key={commit.id}>
            <CommitItem
              commit={commit}
              currentDocument={currentDocument}
              headCommitId={headCommit?.id}
              testInfo={testInfo}
            />
          </li>
        )
      })}
    </CommitItemsWrapper>
  )
}
