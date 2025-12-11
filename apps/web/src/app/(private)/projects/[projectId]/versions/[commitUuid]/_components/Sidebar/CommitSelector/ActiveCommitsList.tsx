'use client'

import { useMemo } from 'react'
import { compact } from 'lodash-es'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { CommitItem } from './CommitItem'
import { CommitItemsWrapper } from './CommitItemsWrapper'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDeploymentTests from '$/stores/deploymentTests'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import {
  DeploymentTest,
  DeploymentTestStatus,
} from '@latitude-data/core/schema/models/types/DeploymentTest'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'

export type CommitTestInfo =
  | {
      type: 'ab'
      isBaseline: boolean
      trafficPercentage: number
      testUuid: string
      status: DeploymentTestStatus
    }
  | {
      type: 'shadow'
      trafficPercentage: number
      testUuid: string
      status: DeploymentTestStatus
    }
  | null

export function getCommitTestInfo(
  commitId: number,
  headCommitId: number | undefined,
  activeTests: DeploymentTest[],
): CommitTestInfo {
  // Baseline is always the head commit, challenger is stored in the test
  const isBaseline = headCommitId === commitId

  // First, check for A/B tests (prioritize showing traffic percentage)
  for (const test of activeTests) {
    if (test.testType === 'ab') {
      const isChallenger = test.challengerCommitId === commitId
      if (isBaseline || isChallenger) {
        // Store challenger's percentage for both baseline and challenger
        // Baseline will calculate its percentage as (100 - challenger %) in BadgeCommit
        const trafficPercentage = test.trafficPercentage ?? 50
        return {
          type: 'ab',
          isBaseline,
          trafficPercentage,
          testUuid: test.uuid,
          status: test.status,
        }
      }
    }
  }

  // Then check for shadow tests
  for (const test of activeTests) {
    if (test.testType === 'shadow') {
      const isChallenger = test.challengerCommitId === commitId
      if (isBaseline || isChallenger) {
        return {
          type: 'shadow',
          trafficPercentage: test.trafficPercentage ?? 100,
          testUuid: test.uuid,
          status: test.status,
        }
      }
    }
  }

  return null
}

export function ActiveCommitsList({
  currentDocument,
  headCommit,
  commitsInActiveTests,
  activeTests: serverActiveTests,
  onCommitPublish,
  onCommitDelete,
}: {
  currentDocument?: DocumentVersion
  headCommit?: Commit
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

  const activeTests = storeActiveTests

  const activeCommits = useMemo(() => {
    const commits = new Map<number, Commit>()

    // Create a map of commits by ID for quick lookup
    const commitsMap = new Map<number, Commit>()
    commitsInActiveTests.forEach((commit) => {
      commitsMap.set(commit.id, commit)
    })

    // Determine which commits should be in the active list based on store's active tests
    const activeCommitIds = new Set<number>()

    // Add head commit if there are any active tests
    if (headCommit && activeTests.length > 0) {
      activeCommitIds.add(headCommit.id)
    }

    // Add challenger commits from active tests
    activeTests.forEach((test) => {
      activeCommitIds.add(test.challengerCommitId)
    })

    // Add commits that are in the active list (from commitsInActiveTests as source of truth for commit objects)
    activeCommitIds.forEach((commitId) => {
      const commit =
        commitsMap.get(commitId) ||
        (headCommit?.id === commitId ? headCommit : undefined)
      if (commit) {
        commits.set(commit.id, commit)
      }
    })

    return Array.from(commits.values())
  }, [headCommit, commitsInActiveTests, activeTests])

  if (activeCommits.length === 0) {
    return (
      <Text.H6 color='foregroundMuted'>
        There are no active versions on this project yet.
      </Text.H6>
    )
  }

  return (
    <CommitItemsWrapper>
      {compact(activeCommits).map((commit) => {
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
