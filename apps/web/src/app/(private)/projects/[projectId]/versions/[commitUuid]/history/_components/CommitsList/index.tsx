import { Commit } from '@latitude-data/core/browser'
import { BadgeCommit } from '../../../_components/Sidebar/CommitSelector/CommitItem'
import { cn } from '@latitude-data/web-ui/utils'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { TruncatedTooltip } from '@latitude-data/web-ui/molecules/TruncatedTooltip'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import useUsers from '$/stores/users'
import { relativeTime } from '$/lib/relativeTime'
import { ReactNode, useMemo } from 'react'
import { useCommitActions } from './commitActions'

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
    [users, commit.userId],
  )
  const { getChangesToRevert, getChangesToReset } = useCommitActions({
    commit,
  })
  const { commit: currentCommit } = useCurrentCommit()

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
        <div className='flex-grow' />
        <DropdownMenu
          onOpenChange={() => {
            onSelect()
          }}
          triggerButtonProps={{
            variant: 'ghost',
            size: 'small',
            iconProps: {
              name: 'ellipsisVertical',
            },
            className: 'p-0 w-fit',
          }}
          options={[
            {
              label: 'Revert changes',
              onClick: getChangesToRevert,
            },
            {
              label: 'Reset project to this version',
              onClick: getChangesToReset,
              disabled:
                !currentCommit.mergedAt && commit.id === currentCommit.id,
            },
          ]}
        />
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
  banner,
}: {
  commits: Commit[]
  selectedCommitId: number
  selectCommitId: (id: number) => void
  banner?: ReactNode
}) {
  const headCommit = commits.find((commit) => !!commit.mergedAt)

  return (
    <div className='flex w-full h-full flex-col custom-scrollbar'>
      {!!banner && (
        <div className='py-2 px-2 border-b border-border'>{banner}</div>
      )}
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
