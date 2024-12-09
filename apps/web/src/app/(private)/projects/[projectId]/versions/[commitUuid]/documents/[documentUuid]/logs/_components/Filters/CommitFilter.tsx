import { useCallback, useMemo } from 'react'

import { Commit } from '@latitude-data/core/browser'
import { Button, Checkbox, Text } from '@latitude-data/web-ui'
import { useCommits } from '$/stores/commitsStore'

import { BadgeCommit } from '../../../../../_components/Sidebar/CommitSelector/CommitItem'
import { FilterButton } from './FilterButton'

function CommitCheckbox({
  commit,
  selectedCommitsIds,
  setSelectedCommitsIds,
}: {
  commit: Commit
  selectedCommitsIds: number[]
  setSelectedCommitsIds: (selectedCommitsIds: number[]) => void
}) {
  const isSelected = useMemo(
    () => selectedCommitsIds.includes(commit.id),
    [selectedCommitsIds, commit],
  )

  const onSelect = useCallback(() => {
    setSelectedCommitsIds(
      isSelected
        ? selectedCommitsIds.filter((id) => id !== commit.id)
        : [...selectedCommitsIds, commit.id],
    )
  }, [selectedCommitsIds, commit, isSelected])

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
  setSelectedCommitsIds,
}: {
  title: string
  commits: Commit[]
  selectedCommitsIds: number[]
  setSelectedCommitsIds: (selectedCommitsIds: number[]) => void
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
              setSelectedCommitsIds={setSelectedCommitsIds}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CommitFilter({
  selectedCommitsIds,
  setSelectedCommitsIds,
  isDefault,
  reset,
}: {
  selectedCommitsIds: number[]
  setSelectedCommitsIds: (selectedCommitsIds: number[]) => void
  isDefault: boolean
  reset: () => void
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

  const filterColor = useMemo(() => {
    if (isDefault) return 'foregroundMuted'
    if (selectedCommitsIds.length) return 'primary'
    return 'destructive'
  }, [isDefault, selectedCommitsIds])

  return (
    <FilterButton label={filterLabel} color={filterColor}>
      <div className='flex flex-row gap-4 w-full flex-nowrap'>
        <Checkbox
          checked={headerState}
          onClick={() =>
            setSelectedCommitsIds(headerState ? [] : commits.map((c) => c.id))
          }
          label={
            <Text.H5 noWrap ellipsis>
              {selectedCommitsIds.length} selected
            </Text.H5>
          }
        />

        <Button
          variant='link'
          className='p-0'
          onClick={reset}
          disabled={isDefault}
        >
          Reset
        </Button>
      </div>
      <div className='flex flex-col gap-4 pr-4'>
        {drafts.length > 0 ? (
          <CommitsList
            title='Drafts'
            commits={drafts}
            selectedCommitsIds={selectedCommitsIds}
            setSelectedCommitsIds={setSelectedCommitsIds}
          />
        ) : null}
        <CommitsList
          title='Published versions'
          commits={mergedCommits}
          selectedCommitsIds={selectedCommitsIds}
          setSelectedCommitsIds={setSelectedCommitsIds}
        />
      </div>
    </FilterButton>
  )
}
