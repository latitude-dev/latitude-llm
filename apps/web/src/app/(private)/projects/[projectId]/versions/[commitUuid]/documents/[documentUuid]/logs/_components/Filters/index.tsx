import {
  DocumentLogFilterOptions,
  LOG_SOURCES,
} from '@latitude-data/core/browser'

import { useProcessLogFilters } from '$/hooks/logFilters/useProcessLogFilters'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { DatePickerRange } from '@latitude-data/web-ui/atoms/DatePicker'
import { CommitFilter } from './CommitFilter'
import { LogSourceFilter } from './LogSourceFilter'

export function DocumentLogFilters({
  filterOptions,
  onFiltersChanged,
  originalSelectedCommitsIds,
}: {
  filterOptions: DocumentLogFilterOptions
  onFiltersChanged: ReactStateDispatch<DocumentLogFilterOptions>
  originalSelectedCommitsIds: number[]
}) {
  const filters = useProcessLogFilters({
    onFiltersChanged,
    filterOptions,
    originalSelectedCommitsIds,
  })
  return (
    <>
      <DatePickerRange
        showPresets
        initialRange={filterOptions.createdAt}
        onCloseChange={filters.onCreatedAtChange}
      />
      <CommitFilter
        selectedCommitsIds={filterOptions.commitIds}
        onSelectCommits={filters.onSelectCommits}
        isDefault={filters.isCommitsDefault}
        reset={() => filters.onSelectCommits(originalSelectedCommitsIds)}
      />
      <LogSourceFilter
        selectedLogSources={filterOptions.logSources}
        onSelectLogSources={filters.onSelectLogSources}
        isDefault={filters.isLogSourcesDefault}
        reset={() => filters.onSelectLogSources(LOG_SOURCES)}
      />
      <div className='max-w-40'>
        <Input
          placeholder='Custom identifier'
          value={filterOptions.customIdentifier ?? ''}
          onChange={(e) => filters.onCustomIdentifierChange(e.target.value)}
        />
      </div>
    </>
  )
}
