import { useCommits } from '$/stores/commitsStore'
import { DatePickerRange } from '@latitude-data/web-ui/atoms/DatePicker'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { endOfDay, startOfDay } from 'date-fns'
import { isEqual } from 'lodash-es'
import { ComponentProps, useMemo } from 'react'
import { CommitFilter } from './CommitFilter'
import { EvaluationResultsV2Search } from '@latitude-data/core/helpers'

export function EvaluationFilters({
  search,
  setSearch,
  isLoading,
}: {
  search: EvaluationResultsV2Search
  setSearch: (search: EvaluationResultsV2Search) => void
  isLoading?: boolean
}) {
  const { data: commits, isLoading: isLoadingCommits } = useCommits()
  const defaultSelectedCommits = useMemo(
    () => commits.map((c) => c.id),
    [commits],
  )

  return (
    <div className='flex items-center gap-4'>
      <Tooltip
        asChild
        trigger={
          <div className='flex flex-row gap-2 items-center'>
            <Text.H6M>Include experiments</Text.H6M>
            <SwitchToggle
              checked={search.filters?.experimentIds?.length !== 0}
              onCheckedChange={(checked) =>
                setSearch({
                  ...search,
                  filters: {
                    ...(search.filters ?? {}),
                    experimentIds: checked ? undefined : [],
                  },
                })
              }
            />
          </div>
        }
        align='center'
        side='top'
      >
        {search.filters?.experimentIds?.length !== 0
          ? 'Filter results from experiments'
          : 'Include results from experiments'}
      </Tooltip>
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
        disabled={isLoading || isLoadingCommits}
      />
    </div>
  )
}
