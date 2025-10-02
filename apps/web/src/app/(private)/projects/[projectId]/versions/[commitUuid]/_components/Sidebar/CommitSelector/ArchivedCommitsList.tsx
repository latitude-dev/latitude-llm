'use client'

import { useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCommits } from '$/stores/commitsStore'

import { CommitItem, CommitItemSkeleton, SimpleUser } from './CommitItem'
import { CommitItemsWrapper } from './CommitItemsWrapper'
import { Commit, DocumentVersion } from '@latitude-data/core/schema/types'
import { CommitStatus } from '@latitude-data/core/constants'

export function ArchivedCommitsList({
  currentDocument,
  headCommit,
  usersById,
}: {
  currentDocument?: DocumentVersion
  headCommit?: Commit
  usersById: Record<string, SimpleUser>
}) {
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
      {commits.map((commit) => (
        <li key={commit.id}>
          <CommitItem
            commit={commit}
            currentDocument={currentDocument}
            user={usersById[commit.userId]}
          />
        </li>
      ))}
    </CommitItemsWrapper>
  )
}
