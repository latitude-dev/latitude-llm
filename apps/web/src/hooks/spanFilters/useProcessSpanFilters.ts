import { paramsToString } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { endOfDay } from 'date-fns'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { SpansFilters } from '$/lib/schemas/filters'

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
        paramsToEncode: ['filters'],
      })
    } else {
      delete params[key]
      newParams = paramsToString({
        params,
        paramsToEncode: ['filters'],
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

export function useProcessSpanFilters({
  onFiltersChanged,
  filterOptions,
}: {
  onFiltersChanged: ReactStateDispatch<SpansFilters>
  filterOptions: SpansFilters
}) {
  const setSearchParams = useEditableSearchParams()

  const isCommitsDefault = useMemo(() => {
    // Default is when no commit filter is set (undefined or empty array)
    return !filterOptions.commitUuids || filterOptions.commitUuids.length === 0
  }, [filterOptions.commitUuids])

  const isExperimentsDefault = useMemo(() => {
    // Default is when no experiment filter is set (undefined or empty array)
    return (
      !filterOptions.experimentUuids ||
      filterOptions.experimentUuids.length === 0
    )
  }, [filterOptions.experimentUuids])

  const isTestDeploymentsDefault = useMemo(() => {
    // Default is when no test deployment filter is set (undefined or empty array)
    return (
      !filterOptions.testDeploymentIds ||
      filterOptions.testDeploymentIds.length === 0
    )
  }, [filterOptions.testDeploymentIds])

  const onSelectCommits = useCallback(
    (selectedCommitUuids: string[] | undefined) => {
      // Remove commitUuids from filter if undefined (all commits selected)
      if (!selectedCommitUuids) {
        const { commitUuids: _, ...restFilters } = filterOptions
        onFiltersChanged(restFilters)

        // If no filters remain, remove the filters param entirely
        if (Object.keys(restFilters).length === 0) {
          setSearchParams('filters', undefined)
        } else {
          setSearchParams('filters', JSON.stringify(restFilters))
        }
      } else {
        onFiltersChanged((currentFilters) => ({
          ...currentFilters,
          commitUuids: selectedCommitUuids,
        }))

        const updatedFilters: SpansFilters = {
          ...filterOptions,
          commitUuids: selectedCommitUuids,
        }
        setSearchParams('filters', JSON.stringify(updatedFilters))
      }
    },
    [onFiltersChanged, setSearchParams, filterOptions],
  )

  const onCreatedAtChange = useCallback(
    (value: SpansFilters['createdAt']) => {
      const createdAtTo = value ? moveToEndOfDay(value.to) : undefined
      const from = value ? value.from : undefined
      const createdAtModified = value ? { from, to: createdAtTo } : undefined

      // Remove createdAt from filter if undefined (no date range selected)
      if (!createdAtModified) {
        const { createdAt: _, ...restFilters } = filterOptions
        onFiltersChanged(restFilters)

        // If no filters remain, remove the filters param entirely
        if (Object.keys(restFilters).length === 0) {
          setSearchParams('filters', undefined)
        } else {
          setSearchParams('filters', JSON.stringify(restFilters))
        }
      } else {
        onFiltersChanged((currentFilters) => ({
          ...currentFilters,
          createdAt: createdAtModified,
        }))

        const updatedFilters: SpansFilters = {
          ...filterOptions,
          createdAt: createdAtModified,
        }
        setSearchParams('filters', JSON.stringify(updatedFilters))
      }
    },
    [onFiltersChanged, setSearchParams, filterOptions],
  )

  const onSelectExperiments = useCallback(
    (selectedExperimentUuids: string[] | undefined) => {
      // Remove experimentUuids from filter if undefined (all experiments selected)
      if (!selectedExperimentUuids) {
        const { experimentUuids: _, ...restFilters } = filterOptions
        onFiltersChanged(restFilters)

        // If no filters remain, remove the filters param entirely
        if (Object.keys(restFilters).length === 0) {
          setSearchParams('filters', undefined)
        } else {
          setSearchParams('filters', JSON.stringify(restFilters))
        }
      } else {
        onFiltersChanged((currentFilters) => ({
          ...currentFilters,
          experimentUuids: selectedExperimentUuids,
        }))

        const updatedFilters: SpansFilters = {
          ...filterOptions,
          experimentUuids: selectedExperimentUuids,
        }
        setSearchParams('filters', JSON.stringify(updatedFilters))
      }
    },
    [onFiltersChanged, setSearchParams, filterOptions],
  )

  const onDocumentLogUuidChange = useCallback(
    (value: string) => {
      value = value?.trim()

      if (!value) {
        const { documentLogUuid: _, ...restFilters } = filterOptions
        onFiltersChanged(restFilters)

        if (Object.keys(restFilters).length === 0) {
          setSearchParams('filters', undefined)
        } else {
          setSearchParams('filters', JSON.stringify(restFilters))
        }
      } else {
        onFiltersChanged((currentFilters) => ({
          ...currentFilters,
          documentLogUuid: value,
        }))

        const updatedFilters: SpansFilters = {
          ...filterOptions,
          documentLogUuid: value,
        }
        setSearchParams('filters', JSON.stringify(updatedFilters))
      }
    },
    [onFiltersChanged, setSearchParams, filterOptions],
  )

  const onSelectTestDeployments = useCallback(
    (selectedTestDeploymentIds: number[] | undefined) => {
      // Remove testDeploymentIds from filter if undefined (all tests selected)
      if (!selectedTestDeploymentIds) {
        const { testDeploymentIds: _, ...restFilters } = filterOptions
        onFiltersChanged(restFilters)

        // If no filters remain, remove the filters param entirely
        if (Object.keys(restFilters).length === 0) {
          setSearchParams('filters', undefined)
        } else {
          setSearchParams('filters', JSON.stringify(restFilters))
        }
      } else {
        onFiltersChanged((currentFilters) => ({
          ...currentFilters,
          testDeploymentIds: selectedTestDeploymentIds,
        }))

        const updatedFilters: SpansFilters = {
          ...filterOptions,
          testDeploymentIds: selectedTestDeploymentIds,
        }
        setSearchParams('filters', JSON.stringify(updatedFilters))
      }
    },
    [onFiltersChanged, setSearchParams, filterOptions],
  )

  return {
    isCommitsDefault,
    isExperimentsDefault,
    isTestDeploymentsDefault,
    onSelectCommits,
    onSelectExperiments,
    onSelectTestDeployments,
    onCreatedAtChange,
    onDocumentLogUuidChange,
  }
}
