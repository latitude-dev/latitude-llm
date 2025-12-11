'use client'

import { compact } from 'lodash-es'
import { useMemo } from 'react'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
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

export function DraftsCommitsList({
  currentDocument,
  headCommit,
  draftCommits,
  commitsInActiveTests,
  activeTests: serverActiveTests,
  onCommitPublish,
  onCommitDelete,
}: {
  currentDocument?: DocumentVersion
  headCommit?: Commit
  draftCommits: Commit[]
  commitsInActiveTests: Commit[]
  activeTests: DeploymentTest[]
  onCommitPublish: ReactStateDispatch<number | null>
  onCommitDelete: ReactStateDispatch<number | null>
}) {
  const { project } = useCurrentProject()
  const { data: storeActiveTests } = useDeploymentTests(
    { projectId: project.id, activeOnly: true },
    { fallbackData: serverActiveTests },
  )

  // Use store data (it will be the same as serverActiveTests initially, but updates when store changes)
  const activeTests = storeActiveTests

  const { data: drafts, isLoading } = useCommits({
    fallbackData: draftCommits,
    commitStatus: CommitStatus.Draft,
  })

  // Filter out commits that are in the active tab (head commit or in active tests)
  const filteredDrafts = useMemo(() => {
    const activeCommitIds = new Set<number>()
    if (headCommit) {
      activeCommitIds.add(headCommit.id)
    }
    commitsInActiveTests.forEach((commit) => {
      activeCommitIds.add(commit.id)
    })

    return compact(drafts).filter((commit) => !activeCommitIds.has(commit.id))
  }, [drafts, headCommit, commitsInActiveTests])

  if (isLoading) {
    return (
      <CommitItemsWrapper>
        {Array.from({ length: 2 }).map((_, i) => (
          <CommitItemSkeleton key={i} />
        ))}
      </CommitItemsWrapper>
    )
  }

  if (filteredDrafts.length === 0) {
    return (
      <Text.H6 color='foregroundMuted'>
        There are no draft versions on this project yet.
      </Text.H6>
    )
  }

  return (
    <CommitItemsWrapper>
      {filteredDrafts.map((commit) => {
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
              onCommitPublish={onCommitPublish}
              onCommitDelete={onCommitDelete}
            />
          </li>
        )
      })}
    </CommitItemsWrapper>
  )
}
