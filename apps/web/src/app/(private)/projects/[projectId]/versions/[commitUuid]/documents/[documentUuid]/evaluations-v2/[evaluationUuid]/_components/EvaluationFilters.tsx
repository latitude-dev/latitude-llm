import { Commit, EvaluationResultsV2Search } from '@latitude-data/core/browser'
import { endOfDay, startOfDay } from 'date-fns'
import { isEqual } from 'lodash-es'
import { ComponentProps, useMemo } from 'react'
import { CommitFilter } from '../../../logs/_components/Filters/CommitFilter'
import { DatePickerRange } from '@latitude-data/web-ui/atoms/DatePicker'

export function EvaluationFilters({
  commits,
  search,
  setSearch,
  isLoading,
}: {
  commits: Record<number, Commit>
  search: EvaluationResultsV2Search
  setSearch: (search: EvaluationResultsV2Search) => void
  isLoading: boolean
}) {
  const defaultSelectedCommits = useMemo(
    () => Object.values(commits).map((c) => c.id),
    [commits],
  )

  return (
    <div className='flex items-center gap-2'>
      <DatePickerRange
        showPresets
        initialRange={
          search.filters?.createdAt as ComponentProps<
            typeof DatePickerRange
          >['initialRange']
        }
        onCloseChange={(value) => {
          if (value?.from) value.from = startOfDay(value.from)
          if (value?.to) value.to = endOfDay(value.to)
          setSearch({
            ...search,
            filters: {
              ...(search.filters ?? {}),
              createdAt: value,
            },
          })
        }}
        disabled={isLoading}
      />
      <CommitFilter
        selectedCommitsIds={search.filters?.commitIds ?? defaultSelectedCommits}
        onSelectCommits={(value) =>
          setSearch({
            ...search,
            filters: {
              ...(search.filters ?? {}),
              commitIds: value,
            },
          })
        }
        isDefault={
          !search.filters?.commitIds ||
          isEqual(search.filters?.commitIds, defaultSelectedCommits)
        }
        reset={() =>
          setSearch({
            ...search,
            filters: {
              ...(search.filters ?? {}),
              commitIds: defaultSelectedCommits,
            },
          })
        }
        disabled={isLoading}
      />
    </div>
  )
}
