'use client'

import React, { useMemo } from 'react'
import { compact } from 'lodash-es'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { CommitItem } from './CommitItem'
import { CommitItemsWrapper } from './CommitItemsWrapper'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'

export type CommitTestInfo =
  | {
      type: 'ab'
      isBaseline: boolean
      trafficPercentage: number
    }
  | {
      type: 'shadow'
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
        // Baseline gets remaining traffic (100 - challenger %), challenger gets its assigned %
        const trafficPercentage = isBaseline
          ? 100 - (test.trafficPercentage ?? 50)
          : (test.trafficPercentage ?? 50)
        return {
          type: 'ab',
          isBaseline,
          trafficPercentage,
        }
      }
    }
  }

  // Then check for shadow tests
  for (const test of activeTests) {
    if (test.testType === 'shadow') {
      const isChallenger = test.challengerCommitId === commitId
      if (isBaseline || isChallenger) {
        return { type: 'shadow' }
      }
    }
  }

  return null
}

export function ActiveCommitsList({
  currentDocument,
  headCommit,
  commitsInActiveTests,
  activeTests,
  onCommitPublish,
  onCommitDelete,
}: {
  currentDocument?: DocumentVersion
  headCommit?: Commit
  commitsInActiveTests: Commit[]
  activeTests: DeploymentTest[]
  onCommitPublish: React.Dispatch<React.SetStateAction<number | null>>
  onCommitDelete: React.Dispatch<React.SetStateAction<number | null>>
}) {
  const activeCommits = useMemo(() => {
    const commits = new Map<number, Commit>()

    // Add head commit if it exists
    if (headCommit) {
      commits.set(headCommit.id, headCommit)
    }

    // Add commits in active test deployments
    commitsInActiveTests.forEach((commit) => {
      commits.set(commit.id, commit)
    })

    return Array.from(commits.values())
  }, [headCommit, commitsInActiveTests])

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
