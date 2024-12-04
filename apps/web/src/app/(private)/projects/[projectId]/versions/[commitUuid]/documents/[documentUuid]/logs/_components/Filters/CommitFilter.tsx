'use client'

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
    <Button variant='ghost' fullWidth className='p-0' onClick={onSelect}>
      <div className='flex flex-row w-full justify-start gap-2'>
        <Checkbox checked={isSelected} fullWidth={false} />
        {commit.version !== undefined && (
          <BadgeCommit commit={commit} isLive={false} />
        )}
        <Text.H5 noWrap ellipsis>
          {commit.title}
        </Text.H5>
      </div>
    </Button>
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
  reset,
}: {
  selectedCommitsIds: number[]
  setSelectedCommitsIds: (selectedCommitsIds: number[]) => void
  reset: () => void
}) {
  const { data: commits } = useCommits()

  const label = useMemo(() => {
    if (!selectedCommitsIds.length) return 'Versions'
    if (selectedCommitsIds.length > 1) {
      return `${selectedCommitsIds.length} versions`
    }

    const selectedCommit = commits.find(
      (commit) => commit.id === selectedCommitsIds[0],
    )

    return selectedCommit?.title ?? '1 version'
  }, [selectedCommitsIds, commits])

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

  return (
    <FilterButton label={label} isActive={!!selectedCommitsIds.length}>
      <div className='flex flex-row gap-4 w-full flex-nowrap'>
        <Button
          variant='ghost'
          fullWidth
          className='p-0'
          onClick={() =>
            setSelectedCommitsIds(headerState ? [] : commits.map((c) => c.id))
          }
        >
          <div className='flex flex-row w-full justify-start gap-2'>
            <Checkbox checked={headerState} fullWidth={false} />
            {selectedCommitsIds.length} selected
          </div>
        </Button>

        <Button variant='link' className='p-0' onClick={reset}>
          Reset
        </Button>
      </div>
      <div className='flex flex-col gap-4 pr-4'>
        <CommitsList
          title='Drafts'
          commits={drafts}
          selectedCommitsIds={selectedCommitsIds}
          setSelectedCommitsIds={setSelectedCommitsIds}
        />
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
