'use client'

import { useCallback } from 'react'

import {
  DocumentLogFilterOptions,
  LogSources,
} from '@latitude-data/core/browser'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { CommitFilter } from './CommitFilter'
import { LogSourceFilter } from './LogSourceFilter'

function useEditableSearchParams() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setSearchParam = (key: string, value?: string | string[]) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(key)

    let newParams = params.toString()
    if (value) {
      const encodedValue = Array.isArray(value)
        ? value.map(encodeURIComponent).join(',')
        : encodeURIComponent(value!)

      newParams = `${params.toString()}${params.size ? '&' : ''}${key}=${encodedValue}`
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
  setDocumentLogFilterOptions: (options: DocumentLogFilterOptions) => void
  originalSelectedCommitsIds: number[]
}) {
  const setSearchParams = useEditableSearchParams()

  const setSelectedCommitsIds = useCallback((selectedCommitsIds: number[]) => {
    setDocumentLogFilterOptions({
      ...documentLogFilterOptions,
      commitIds: selectedCommitsIds,
    })
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
      setDocumentLogFilterOptions({
        ...documentLogFilterOptions,
        logSources: selectedLogSources,
      })
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
    <div className='flex flex-row gap-2 justify-end items-center'>
      <CommitFilter
        selectedCommitsIds={documentLogFilterOptions.commitIds}
        setSelectedCommitsIds={setSelectedCommitsIds}
        reset={() => setSelectedCommitsIds(originalSelectedCommitsIds)}
      />
      <LogSourceFilter
        selectedLogSources={documentLogFilterOptions.logSources}
        setSelectedLogSources={setSelectedLogSources}
        reset={() => setSelectedLogSources(Object.values(LogSources))}
      />
    </div>
  )
}
