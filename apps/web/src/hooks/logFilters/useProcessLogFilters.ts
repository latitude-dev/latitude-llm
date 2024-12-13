import { useCallback, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  DocumentLogFilterOptions,
  LOG_FILTERS_ENCODED_PARAMS,
  LOG_SOURCES,
  LogSources,
} from '@latitude-data/core/browser'
import { ReactStateDispatch } from '@latitude-data/web-ui'
import { paramsToString } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { formatDocumentLogCreatedAtParam } from '@latitude-data/core/services/documentLogs/logsFilterUtils/generateDocumentLogsApiRouteWithParams'
import { endOfDay } from 'date-fns'

function useEditableSearchParams() {
  const router = useRouter()
  const pathname = usePathname()

  const setSearchParam = (key: string, value?: string | string[]) => {
    const prevParams = window.location.search
    const urlParams = new URLSearchParams(prevParams)
    const params = Object.fromEntries(urlParams.entries())

    let newParams = undefined

    if (value) {
      const data = {
        ...params,
        [key]: Array.isArray(value) ? value.join(',') : value,
      }
      newParams = paramsToString({
        params: data,
        paramsToEncode: LOG_FILTERS_ENCODED_PARAMS,
      })
    } else {
      delete params[key]
      newParams = paramsToString({
        params,
        paramsToEncode: LOG_FILTERS_ENCODED_PARAMS,
      })
    }

    router.push(`${pathname}${newParams ? '?' : ''}${newParams}`)
  }

  return setSearchParam
}

function moveToEndOfDay(date: Date | undefined) {
  if (!date) return undefined

  return endOfDay(date)
}

export function useProcessLogFilters({
  onFiltersChanged,
  filterOptions,
  originalSelectedCommitsIds,
}: {
  onFiltersChanged: ReactStateDispatch<DocumentLogFilterOptions>
  filterOptions: DocumentLogFilterOptions
  originalSelectedCommitsIds: number[]
}) {
  const setSearchParams = useEditableSearchParams()

  const isCommitsDefault = useMemo(() => {
    return (
      filterOptions.commitIds.sort().join(',') ===
      originalSelectedCommitsIds.sort().join(',')
    )
  }, [filterOptions.commitIds])

  const isLogSourcesDefault = useMemo(() => {
    return (
      filterOptions.logSources.sort().join(',') === LOG_SOURCES.sort().join(',')
    )
  }, [filterOptions.logSources])

  const onSelectCommits = useCallback((selectedCommitsIds: number[]) => {
    onFiltersChanged((currentFilters) => ({
      ...currentFilters,
      commitIds: selectedCommitsIds,
    }))
    if (
      selectedCommitsIds.sort().join(',') ===
      originalSelectedCommitsIds.sort().join(',')
    ) {
      setSearchParams('versions', undefined)
    } else {
      setSearchParams('versions', selectedCommitsIds.map(String))
    }
  }, [])

  const onCreatedAtChange = useCallback(
    (value: DocumentLogFilterOptions['createdAt']) => {
      const createdAtTo = value ? moveToEndOfDay(value.to) : undefined
      const from = value ? value.from : undefined
      const createdAtModified = value ? { from, to: createdAtTo } : undefined
      onFiltersChanged((currentFilters) => ({
        ...currentFilters,
        createdAt: createdAtModified,
      }))

      const data = formatDocumentLogCreatedAtParam(createdAtModified)

      if (!data) {
        setSearchParams('createdAt', undefined)
      } else {
        const { key, formattedValue } = data
        setSearchParams(key, formattedValue)
      }
    },
    [],
  )

  const onSelectLogSources = useCallback((selectedLogSources: LogSources[]) => {
    onFiltersChanged((currentFilters) => ({
      ...currentFilters,
      logSources: selectedLogSources,
    }))
    if (selectedLogSources.sort().join(',') === LOG_SOURCES.sort().join(',')) {
      setSearchParams('origins', undefined)
    } else {
      setSearchParams('origins', selectedLogSources)
    }
  }, [])

  return {
    isCommitsDefault,
    isLogSourcesDefault,
    onSelectLogSources,
    onSelectCommits,
    onCreatedAtChange,
  }
}
