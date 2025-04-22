'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useExperiments } from '$/stores/experiments'
import { Commit, Project } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { ExperimentsTable } from '../ExperimentsTable'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import { useCallback, useState } from 'react'
import { ExperimentComparison } from '../ExperimentsComparison'

export function ExperimentsPageContent() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { isCreating: isCreatingExperiment } = useExperiments({
    projectId: project.id,
    documentUuid: document.documentUuid,
  })

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedExperimentUuids, setSelectedExperimentUuids] = useState<
    string[]
  >(() => {
    if (typeof window === 'undefined') return []
    const params = new URLSearchParams(window.location.search)
    const selected = params.get('selected')
    return selected ? selected.split(',') : []
  })

  const handleExperimentSelect = useCallback(
    (experimentUuid: string) => {
      const newSelection = selectedExperimentUuids.includes(experimentUuid)
        ? selectedExperimentUuids.filter((id) => id !== experimentUuid)
        : [...selectedExperimentUuids, experimentUuid]

      setSelectedExperimentUuids(newSelection)

      if (typeof window === 'undefined') return

      const params = new URLSearchParams(window.location.search)
      if (newSelection.length === 0) {
        params.delete('selected')
      } else {
        params.set('selected', newSelection.join(','))
      }

      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}?${params}`,
      )
    },
    [selectedExperimentUuids],
  )

  const onCreateExperiment = useCallback(
    (experiment: { uuid: string }) => {
      setSelectedExperimentUuids((prev) => [...prev, experiment.uuid])
      setIsModalOpen(false)
    },
    [setSelectedExperimentUuids],
  )

  return (
    <div className='w-full p-6 flex flex-col gap-4'>
      <div className='w-full items-center justify-between flex gap-2'>
        <Text.H4B>Experiment history</Text.H4B>
        <Button
          isLoading={isCreatingExperiment}
          variant='default'
          fancy
          onClick={() => setIsModalOpen(true)}
        >
          Run Experiment
        </Button>
      </div>

      <ExperimentComparison
        selectedExperimentUuids={selectedExperimentUuids}
        onUnselectExperiment={handleExperimentSelect}
      />

      <ExperimentsTable
        selectedExperiments={selectedExperimentUuids}
        onSelectExperiment={handleExperimentSelect}
      />
      <RunExperimentModal
        project={project as Project}
        commit={commit as Commit}
        document={document}
        isOpen={isModalOpen}
        setOpen={setIsModalOpen}
        onCreate={onCreateExperiment}
      />
    </div>
  )
}
