import { Commit } from '@latitude-data/core/browser'
import { BadgeCommit } from '../../../_components/Sidebar/CommitSelector/CommitItem'
import { cn, Text, Tooltip, TruncatedTooltip } from '@latitude-data/web-ui'
import useUsers from '$/stores/users'
import { relativeTime } from '$/lib/relativeTime'
import { useMemo } from 'react'

function CommitItem({
  commit,
  isHead,
  isSelected,
  onSelect,
}: {
  commit: Commit
  isHead: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  const { data: users } = useUsers()
  const userName = useMemo(
    () =>
      users?.find((user) => user.id === commit.userId)?.name ?? 'Unknown user',
    [users],
  )

  return (
    <div
      className={cn(
        'flex flex-col flex-shrink-0 gap-2 p-2 cursor-pointer truncate border-b border-border',
        {
          'bg-accent': isSelected,
          'hover:bg-secondary': !isSelected,
        },
      )}
      onClick={onSelect}
    >
      <div className='flex flex-row items-center gap-2'>
        <BadgeCommit commit={commit} isLive={isHead} />
        <TruncatedTooltip content={commit.title}>
          <Text.H5M noWrap ellipsis>
            {commit.title}
          </Text.H5M>
        </TruncatedTooltip>
      </div>
      {commit.description && (
        <TruncatedTooltip content={commit.description}>
          <Text.H6 color='foregroundMuted' noWrap ellipsis>
            {commit.description}
          </Text.H6>
        </TruncatedTooltip>
      )}
      <div className='flex flex-row items-center gap-1 truncate'>
        <TruncatedTooltip content={userName}>
          <Text.H6 color='foregroundMuted' noWrap ellipsis>
            {userName}
          </Text.H6>
        </TruncatedTooltip>
        {commit.mergedAt && (
          <>
            <div className='min-w-0.5 min-h-0.5 bg-muted-foreground rounded-full' />
            <Tooltip
              asChild
              trigger={
                <div className='flex flex-row items-center truncate'>
                  <Text.H6 color='foregroundMuted' noWrap ellipsis>
                    {relativeTime(commit.mergedAt)}
                  </Text.H6>
                </div>
              }
            >
              {commit.mergedAt.toLocaleString()}
            </Tooltip>
          </>
        )}
      </div>
    </div>
  )
}

export function CommitsList({
  commits,
  selectedCommitId,
  selectCommitId,
}: {
  commits: Commit[]
  selectedCommitId: number
  selectCommitId: (id: number) => void
}) {
  const headCommit = commits.find((commit) => !!commit.mergedAt)

  return (
    <div className='flex w-full h-full flex-col custom-scrollbar pr-px'>
      {commits.map((commit) => (
        <CommitItem
          key={commit.id}
          commit={commit}
          isHead={commit.id === headCommit?.id}
          isSelected={commit.id === selectedCommitId}
          onSelect={() => selectCommitId(commit.id)}
        />
      ))}
    </div>
  )
}
