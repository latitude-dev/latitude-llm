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
  selectedCommitsIds,
  onSelectCommits,
}: {
  commit: Commit
  selectedCommitsIds: number[]
  onSelectCommits: (selectedCommitsIds: number[]) => void
}) {
  const isSelected = useMemo(
    () => selectedCommitsIds.includes(commit.id),
    [selectedCommitsIds, commit],
  )

  const onSelect = useCallback(() => {
    onSelectCommits(
      isSelected
        ? selectedCommitsIds.filter((id) => id !== commit.id)
        : [...selectedCommitsIds, commit.id],
    )
  }, [selectedCommitsIds, commit, isSelected, onSelectCommits])

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
  selectedCommitsIds,
  onSelectCommits,
}: {
  title: string
  commits: Commit[]
  selectedCommitsIds: number[]
  onSelectCommits: (selectedCommitsIds: number[]) => void
}) {
  return (
    <div className='flex flex-col gap-2 w-full'>
      <Text.H5B>{title}</Text.H5B>
      <ul className='flex flex-col gap-2 w-full'>
        {commits.map((commit) => (
          <li key={commit.id}>
            <CommitCheckbox
              commit={commit}
              selectedCommitsIds={selectedCommitsIds}
              onSelectCommits={onSelectCommits}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CommitFilter({
  selectedCommitsIds,
  onSelectCommits,
  isDefault,
  reset,
  disabled,
}: {
  selectedCommitsIds: number[]
  onSelectCommits: (selectedCommitsIds: number[]) => void
  isDefault: boolean
  reset: () => void
  disabled?: boolean
}) {
  const { data: commits } = useCommits()

  const headerState = useMemo(() => {
    if (selectedCommitsIds.length === 0) return false
    if (selectedCommitsIds.length === commits.length) return true
    return 'indeterminate'
  }, [selectedCommitsIds, commits])

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
    if (selectedCommitsIds.length === 0) return 'No versions selected'
    if (selectedCommitsIds.length > 1) {
      return `${selectedCommitsIds.length} versions`
    }
    const selectedCommit = commits.find(
      (commit) => commit.id === selectedCommitsIds[0],
    )
    return selectedCommit?.title ?? '1 version'
  }, [isDefault, selectedCommitsIds, commits])

  const filterColor = useFilterButtonColor({
    isDefault,
    isSelected: selectedCommitsIds.length > 0,
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
            onSelectCommits(headerState ? [] : commits.map((c) => c.id))
          }
          label={
            <Text.H5 noWrap ellipsis>
              {selectedCommitsIds.length} selected
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
            selectedCommitsIds={selectedCommitsIds}
            onSelectCommits={onSelectCommits}
          />
        ) : null}
        <CommitsList
          title='Published versions'
          commits={mergedCommits}
          selectedCommitsIds={selectedCommitsIds}
          onSelectCommits={onSelectCommits}
        />
      </div>
    </FilterButton>
  )
}
