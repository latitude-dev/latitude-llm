import { useProcessSpanFilters } from '$/hooks/spanFilters/useProcessSpanFilters'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { DatePickerRange } from '@latitude-data/web-ui/atoms/DatePicker'
import { SpansFilters } from '$/lib/schemas/filters'
import { useMemo, useCallback } from 'react'
import { CommitFilterByUuid } from './CommitFilterByUuid'
import { ExperimentFilterByUuid } from './ExperimentFilterByUuid'
import { TestDeploymentFilter } from './TestDeploymentFilter'
import { useExperiments } from '$/stores/experiments'
import useDeploymentTests from '$/stores/deploymentTests'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'

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

  const filters = useProcessSpanFilters({
    onFiltersChanged,
    filterOptions,
  })

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
      <div className='max-w-40'>
        <Input
          placeholder='Conversation ID'
          value={filterOptions.documentLogUuid ?? ''}
          onChange={(e) => filters.onDocumentLogUuidChange(e.target.value)}
        />
      </div>
    </>
  )
}
