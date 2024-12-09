import { useCallback, useMemo } from 'react'

import {
  DocumentLogFilterOptions,
  LOG_SOURCES,
  LogSources,
} from '@latitude-data/core/browser'
import { usePathname, useRouter } from 'next/navigation'

import { CommitFilter } from './CommitFilter'
import { LogSourceFilter } from './LogSourceFilter'
import { ReactStateDispatch } from '@latitude-data/web-ui'

function useEditableSearchParams() {
  const router = useRouter()
  const pathname = usePathname()

  const setSearchParam = (key: string, value?: string | string[]) => {
    const prevParams = window.location.search
    const urlParams = new URLSearchParams(prevParams)
    const params = Object.fromEntries(urlParams.entries())

    let newParams = prevParams
    if (value) {
      const data = {
        ...params,
        [key]: Array.isArray(value) ? value.join(',') : value,
      }
      newParams = new URLSearchParams(data).toString()
    }

    router.replace(`${pathname}${newParams ? '?' : ''}${newParams}`)
  }

  return setSearchParam
}

export function DocumentLogFilters({
  documentLogFilterOptions,
  setDocumentLogFilterOptions,
  originalSelectedCommitsIds,
}: {
  documentLogFilterOptions: DocumentLogFilterOptions
  setDocumentLogFilterOptions: ReactStateDispatch<DocumentLogFilterOptions>
  originalSelectedCommitsIds: number[]
}) {
  const setSearchParams = useEditableSearchParams()

  const isCommitsDefault = useMemo(() => {
    return (
      documentLogFilterOptions.commitIds.sort().join(',') ===
      originalSelectedCommitsIds.sort().join(',')
    )
  }, [documentLogFilterOptions.commitIds])

  const isLogSourcesDefault = useMemo(() => {
    return (
      documentLogFilterOptions.logSources.sort().join(',') ===
      LOG_SOURCES.sort().join(',')
    )
  }, [documentLogFilterOptions.logSources])

  const setSelectedCommitsIds = useCallback((selectedCommitsIds: number[]) => {
    setDocumentLogFilterOptions((currentFilters) => ({
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

  const setSelectedLogSources = useCallback(
    (selectedLogSources: LogSources[]) => {
      setDocumentLogFilterOptions((currentFilters) => ({
        ...currentFilters,
        logSources: selectedLogSources,
      }))
      if (
        selectedLogSources.sort().join(',') ===
        Object.values(LogSources).sort().join(',')
      ) {
        setSearchParams('origins', undefined)
      } else {
        setSearchParams('origins', selectedLogSources)
      }
    },
    [],
  )

  return (
    <>
      <CommitFilter
        selectedCommitsIds={documentLogFilterOptions.commitIds}
        setSelectedCommitsIds={setSelectedCommitsIds}
        isDefault={isCommitsDefault}
        reset={() => setSelectedCommitsIds(originalSelectedCommitsIds)}
      />
      <LogSourceFilter
        selectedLogSources={documentLogFilterOptions.logSources}
        setSelectedLogSources={setSelectedLogSources}
        isDefault={isLogSourcesDefault}
        reset={() => setSelectedLogSources(Object.values(LogSources))}
      />
    </>
  )
}
