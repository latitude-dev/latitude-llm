import {
  DocumentLogFilterOptions,
  LOG_SOURCES,
} from '@latitude-data/core/browser'

import { CommitFilter } from './CommitFilter'
import { LogSourceFilter } from './LogSourceFilter'
import { ReactStateDispatch, DatePickerRange } from '@latitude-data/web-ui'
import { useProcessLogFilters } from '$/hooks/logFilters/useProcessLogFilters'

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
    </>
  )
}
