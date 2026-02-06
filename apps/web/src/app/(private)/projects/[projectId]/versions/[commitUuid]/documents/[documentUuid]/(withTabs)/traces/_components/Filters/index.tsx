import { useProcessSpanFilters } from '$/hooks/spanFilters/useProcessSpanFilters'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { DatePickerRange } from '@latitude-data/web-ui/atoms/DatePicker'
import { SpansFilters } from '$/lib/schemas/filters'
import {
  useMemo,
  useCallback,
  useState,
  ChangeEvent,
  KeyboardEvent,
} from 'react'
import { CommitFilterByUuid } from './CommitFilterByUuid'
import { ExperimentFilterByUuid } from './ExperimentFilterByUuid'
import { TestDeploymentFilter } from './TestDeploymentFilter'
import { useExperiments } from '$/stores/experiments'
import useDeploymentTests from '$/stores/deploymentTests'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { Button } from '@latitude-data/web-ui/atoms/Button'

export function SpanFilters({
  filterOptions,
  onFiltersChanged,
}: {
  filterOptions: SpansFilters
  onFiltersChanged: ReactStateDispatch<SpansFilters>
}) {
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const { data: experiments = [] } = useExperiments({
    projectId: project.id,
    documentUuid: document.documentUuid,
  })
  const { data: deploymentTests = [] } = useDeploymentTests({
    projectId: project.id,
  })

  const [localDocumentLogUuid, setLocalDocumentLogUuid] = useState(
    filterOptions.documentLogUuid ?? '',
  )
  const filters = useProcessSpanFilters({
    onFiltersChanged,
    filterOptions,
  })

  const committedValue = filterOptions.documentLogUuid ?? ''
  const hasUncommittedChanges = localDocumentLogUuid !== committedValue

  const handleDocumentLogUuidChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setLocalDocumentLogUuid(e.target.value)
    },
    [],
  )

  const onDocumentLogUuidChange = filters.onDocumentLogUuidChange
  const handleDocumentLogUuidSubmit = useCallback(() => {
    onDocumentLogUuidChange(localDocumentLogUuid)
  }, [onDocumentLogUuidChange, localDocumentLogUuid])

  const handleDocumentLogUuidClear = useCallback(() => {
    setLocalDocumentLogUuid('')
    onDocumentLogUuidChange('')
  }, [onDocumentLogUuidChange])

  const handleDocumentLogUuidKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleDocumentLogUuidSubmit()
      }
    },
    [handleDocumentLogUuidSubmit],
  )

  // Get selected commit UUIDs - empty array when no filter is set
  const selectedCommitUuids = useMemo(() => {
    return filterOptions.commitUuids || []
  }, [filterOptions.commitUuids])

  // Get selected experiment UUIDs - empty array when no filter is set
  const selectedExperimentUuids = useMemo(() => {
    return filterOptions.experimentUuids || []
  }, [filterOptions.experimentUuids])

  // Get selected test deployment IDs - empty array when no filter is set
  const selectedTestDeploymentIds = useMemo(() => {
    return filterOptions.testDeploymentIds || []
  }, [filterOptions.testDeploymentIds])

  // Handle commit selection changes
  const handleCommitSelectionChange = useCallback(
    (selectedUuids: string[]) => {
      // If no commits are selected, clear the filter (undefined = no filter)
      if (selectedUuids.length === 0) {
        filters.onSelectCommits(undefined)
      } else {
        filters.onSelectCommits(selectedUuids)
      }
    },
    [filters],
  )

  // Handle experiment selection changes
  const handleExperimentSelectionChange = useCallback(
    (selectedUuids: string[]) => {
      // If no experiments are selected, clear the filter (undefined = no filter)
      if (selectedUuids.length === 0) {
        filters.onSelectExperiments(undefined)
      } else {
        filters.onSelectExperiments(selectedUuids)
      }
    },
    [filters],
  )

  // Handle test deployment selection changes
  const handleTestDeploymentSelectionChange = useCallback(
    (selectedIds: number[]) => {
      // If no test deployments are selected, clear the filter (undefined = no filter)
      if (selectedIds.length === 0) {
        filters.onSelectTestDeployments(undefined)
      } else {
        filters.onSelectTestDeployments(selectedIds)
      }
    },
    [filters],
  )

  return (
    <>
      <DatePickerRange
        showPresets
        initialRange={
          filterOptions?.createdAt?.from
            ? (filterOptions.createdAt as { from: Date; to: Date | undefined })
            : undefined
        }
        onCloseChange={filters.onCreatedAtChange}
      />
      <CommitFilterByUuid
        selectedCommitUuids={selectedCommitUuids}
        onSelectCommits={handleCommitSelectionChange}
        isDefault={filters.isCommitsDefault}
        reset={() => filters.onSelectCommits(undefined)}
      />
      {experiments.length > 0 && (
        <ExperimentFilterByUuid
          selectedExperimentUuids={selectedExperimentUuids}
          onSelectExperiments={handleExperimentSelectionChange}
          isDefault={filters.isExperimentsDefault}
          reset={() => filters.onSelectExperiments(undefined)}
          experiments={experiments}
        />
      )}
      {deploymentTests.length > 0 && (
        <TestDeploymentFilter
          selectedTestIds={selectedTestDeploymentIds}
          onSelectTests={handleTestDeploymentSelectionChange}
          isDefault={filters.isTestDeploymentsDefault}
          reset={() => filters.onSelectTestDeployments(undefined)}
          tests={deploymentTests}
        />
      )}
      <div className='max-w-48 relative'>
        <Input
          placeholder='Conversation ID'
          value={localDocumentLogUuid}
          onChange={handleDocumentLogUuidChange}
          onKeyDown={handleDocumentLogUuidKeyDown}
          className='pr-14'
        />
        <div className='absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1'>
          {hasUncommittedChanges && localDocumentLogUuid && (
            <Button
              title='Search'
              type='button'
              variant='ghost'
              size='icon'
              onClick={handleDocumentLogUuidSubmit}
              iconProps={{ name: 'search' }}
            />
          )}
          {localDocumentLogUuid && (
            <Button
              title='Clear'
              type='button'
              variant='ghost'
              size='icon'
              onClick={handleDocumentLogUuidClear}
              iconProps={{
                name: 'close',
              }}
            />
          )}
        </div>
      </div>
    </>
  )
}
