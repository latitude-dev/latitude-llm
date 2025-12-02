import { useCallback, useMemo } from 'react'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'

import { useCommits } from '$/stores/commitsStore'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { BadgeCommit } from '../../../../../../_components/Sidebar/CommitSelector/CommitItem'
import { useFilterButtonColor, FilterButton } from '$/components/FilterButton'

function CommitCheckbox({
  commit,
  selectedCommitUuids,
  onSelectCommits,
}: {
  commit: Commit
  selectedCommitUuids: string[]
  onSelectCommits: (selectedCommitUuids: string[]) => void
}) {
  const isSelected = useMemo(
    () => selectedCommitUuids.includes(commit.uuid),
    [selectedCommitUuids, commit],
  )

  const onSelect = useCallback(() => {
    onSelectCommits(
      isSelected
        ? selectedCommitUuids.filter((uuid) => uuid !== commit.uuid)
        : [...selectedCommitUuids, commit.uuid],
    )
  }, [selectedCommitUuids, commit, isSelected, onSelectCommits])

  return (
    <Checkbox
      checked={isSelected}
      onClick={onSelect}
      label={
        <div className='flex flex-row w-full justify-start gap-2'>
          {commit.version !== undefined && (
            <BadgeCommit commit={commit} isLive={false} />
          )}
          <Text.H5 noWrap ellipsis>
            {commit.title}
          </Text.H5>
        </div>
      }
    />
  )
}

function CommitsList({
  title,
  commits,
  selectedCommitUuids,
  onSelectCommits,
}: {
  title: string
  commits: Commit[]
  selectedCommitUuids: string[]
  onSelectCommits: (selectedCommitUuids: string[]) => void
}) {
  return (
    <div className='flex flex-col gap-2 w-full'>
      <Text.H5B>{title}</Text.H5B>
      <ul className='flex flex-col gap-2 w-full'>
        {commits.map((commit) => (
          <li key={commit.id}>
            <CommitCheckbox
              commit={commit}
              selectedCommitUuids={selectedCommitUuids}
              onSelectCommits={onSelectCommits}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CommitFilterByUuid({
  selectedCommitUuids,
  onSelectCommits,
  isDefault,
  reset,
  disabled,
}: {
  selectedCommitUuids: string[]
  onSelectCommits: (selectedCommitUuids: string[]) => void
  isDefault: boolean
  reset: () => void
  disabled?: boolean
}) {
  const { data: commits } = useCommits()

  const mergedCommits = useMemo(
    () =>
      commits
        .filter((c) => !!c.mergedAt)
        .sort((a, b) => {
          return a.mergedAt! > b.mergedAt! ? -1 : 1
        }),
    [commits],
  )

  const drafts = useMemo(() => commits.filter((c) => !c.mergedAt), [commits])

  const filterLabel = useMemo(() => {
    if (isDefault) return 'All versions'
    if (selectedCommitUuids.length === 0) return 'No versions selected'
    if (selectedCommitUuids.length > 1) {
      return `${selectedCommitUuids.length} versions`
    }
    const selectedCommit = commits.find(
      (commit) => commit.uuid === selectedCommitUuids[0],
    )
    return selectedCommit?.title ?? '1 version'
  }, [isDefault, selectedCommitUuids, commits])

  const filterColor = useFilterButtonColor({
    isDefault,
    isSelected: selectedCommitUuids.length > 0,
  })

  return (
    <FilterButton
      label={filterLabel}
      color={filterColor.color}
      darkColor={filterColor.darkColor}
    >
      <div className='flex flex-row gap-4 w-full flex-nowrap justify-end'>
        <Button
          size='none'
          variant='link'
          onClick={reset}
          disabled={disabled || isDefault}
        >
          Reset
        </Button>
      </div>
      <div className='flex flex-col gap-4'>
        {drafts.length > 0 ? (
          <CommitsList
            title='Drafts'
            commits={drafts}
            selectedCommitUuids={selectedCommitUuids}
            onSelectCommits={onSelectCommits}
          />
        ) : null}
        <CommitsList
          title='Published versions'
          commits={mergedCommits}
          selectedCommitUuids={selectedCommitUuids}
          onSelectCommits={onSelectCommits}
        />
      </div>
    </FilterButton>
  )
}
