import {
  CommitStatus,
  DocumentVersion,
  type Commit,
} from '@latitude-data/core/browser'
import { ReactStateDispatch } from '@latitude-data/web-ui'
import useCommits from '$/stores/commitsStore'

import { CommitItem, CommitItemSkeleton, SimpleUser } from './CommitItem'
import { CommitItemsWrapper } from './CommitItemsWrapper'

export function CurrentCommitsList({
  currentDocument,
  headCommit,
  draftCommits,
  usersById,
  onCommitPublish,
  onCommitDelete,
}: {
  currentDocument?: DocumentVersion
  headCommit?: Commit
  draftCommits: Commit[]
  usersById: Record<string, SimpleUser>
  onCommitPublish: ReactStateDispatch<number | null>
  onCommitDelete: ReactStateDispatch<number | null>
}) {
  const { data: drafts, isLoading } = useCommits({
    fallbackData: draftCommits,
    commitStatus: CommitStatus.Draft,
  })

  if (isLoading) {
    return (
      <CommitItemsWrapper>
        {Array.from({ length: 2 }).map((_, i) => (
          <CommitItemSkeleton key={i} />
        ))}
      </CommitItemsWrapper>
    )
  }

  return (
    <CommitItemsWrapper>
      {headCommit && (
        <CommitItem
          commit={headCommit}
          currentDocument={currentDocument}
          headCommitId={headCommit.id}
          user={usersById[headCommit.userId]}
          onCommitPublish={onCommitPublish}
          onCommitDelete={onCommitDelete}
        />
      )}
      {drafts.map((commit) => (
        <li key={commit.id}>
          <CommitItem
            commit={commit}
            currentDocument={currentDocument}
            headCommitId={headCommit?.id}
            user={usersById[commit.userId]}
            onCommitPublish={onCommitPublish}
            onCommitDelete={onCommitDelete}
          />
        </li>
      ))}
    </CommitItemsWrapper>
  )
}
