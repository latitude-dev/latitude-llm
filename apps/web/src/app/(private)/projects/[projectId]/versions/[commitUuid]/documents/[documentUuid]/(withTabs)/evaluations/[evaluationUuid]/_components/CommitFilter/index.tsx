import { useCallback, useMemo } from 'react'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'

import { useCommits } from '$/stores/commitsStore'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { useFilterButtonColor, FilterButton } from '$/components/FilterButton'
import { BadgeCommit } from '../../../../../../../_components/Sidebar/CommitSelector/CommitItem'

function CommitCheckbox({
  commit,
  selectedCommitsUuids,
  onSelectCommits,
}: {
  commit: Commit
  selectedCommitsUuids: string[]
  onSelectCommits: (selectedCommitsUuids: string[]) => void
}) {
  const isSelected = useMemo(
    () => selectedCommitsUuids.includes(commit.uuid),
    [selectedCommitsUuids, commit],
  )

  const onSelect = useCallback(() => {
    onSelectCommits(
      isSelected
        ? selectedCommitsUuids.filter((uuid) => uuid !== commit.uuid)
        : [...selectedCommitsUuids, commit.uuid],
    )
  }, [selectedCommitsUuids, commit, isSelected, onSelectCommits])

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
  selectedCommitsUuids,
  onSelectCommits,
}: {
  title: string
  commits: Commit[]
  selectedCommitsUuids: string[]
  onSelectCommits: (selectedCommitsUuids: string[]) => void
}) {
  return (
    <div className='flex flex-col gap-2 w-full'>
      <Text.H5B>{title}</Text.H5B>
      <ul className='flex flex-col gap-2 w-full'>
        {commits.map((commit) => (
          <li key={commit.id}>
            <CommitCheckbox
              commit={commit}
              selectedCommitsUuids={selectedCommitsUuids}
              onSelectCommits={onSelectCommits}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CommitFilter({
  selectedCommitsUuids,
  onSelectCommits,
  isDefault,
  reset,
  disabled,
}: {
  selectedCommitsUuids: string[]
  onSelectCommits: (selectedCommitsUuids: string[]) => void
  isDefault: boolean
  reset: () => void
  disabled?: boolean
}) {
  const { data: commits } = useCommits()

  const headerState = useMemo(() => {
    if (selectedCommitsUuids.length === 0) return false
    if (selectedCommitsUuids.length === commits.length) return true
    return 'indeterminate'
  }, [selectedCommitsUuids, commits])

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
    if (isDefault) return 'Current versions'
    if (selectedCommitsUuids.length === 0) return 'No versions selected'
    if (selectedCommitsUuids.length > 1) {
      return `${selectedCommitsUuids.length} versions`
    }
    const selectedCommit = commits.find(
      (commit) => commit.uuid === selectedCommitsUuids[0],
    )
    return selectedCommit?.title ?? '1 version'
  }, [isDefault, selectedCommitsUuids, commits])

  const filterColor = useFilterButtonColor({
    isDefault,
    isSelected: selectedCommitsUuids.length > 0,
  })

  return (
    <FilterButton
      label={filterLabel}
      color={filterColor.color}
      darkColor={filterColor.darkColor}
    >
      <div className='flex flex-row gap-4 w-full flex-nowrap'>
        <Checkbox
          checked={headerState}
          onClick={() =>
            onSelectCommits(headerState ? [] : commits.map((c) => c.uuid))
          }
          label={
            <Text.H5 noWrap ellipsis>
              {selectedCommitsUuids.length} selected
            </Text.H5>
          }
          disabled={disabled}
        />
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
            selectedCommitsUuids={selectedCommitsUuids}
            onSelectCommits={onSelectCommits}
          />
        ) : null}
        <CommitsList
          title='Published versions'
          commits={mergedCommits}
          selectedCommitsUuids={selectedCommitsUuids}
          onSelectCommits={onSelectCommits}
        />
      </div>
    </FilterButton>
  )
}
