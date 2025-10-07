'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useExperiments } from '$/stores/experiments'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { ExperimentsTable } from '../ExperimentsTable'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import { useCallback, useEffect, useState } from 'react'
import { ExperimentComparison } from '../ExperimentsComparison'
import { EmptyPage } from './EmptyPage'
import { useSearchParams } from 'next/navigation'
import { MetadataProvider } from '$/components/MetadataProvider'
import { Commit, Project } from '@latitude-data/core/schema/types'

export function ExperimentsPageContent({
  initialCount,
}: {
  initialCount: number
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { isCreating: isCreatingExperiment, count } = useExperiments({
    projectId: project.id,
    documentUuid: document.documentUuid,
  })

  const [isModalOpen, setIsModalOpen] = useState(false)

  const [selectedExperimentUuids, _setSelectedExperimentUuids] = useState<
    string[]
  >([])
  const searchParams = useSearchParams()
  useEffect(() => {
    const selected = searchParams.get('selected')
    _setSelectedExperimentUuids(selected ? selected.split(',') : [])
  }, [searchParams])

  const setSelectedExperimentUuids = useCallback(
    (newSelection: string[]) => {
      _setSelectedExperimentUuids(newSelection)

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
    [_setSelectedExperimentUuids],
  )

  const handleExperimentSelect = useCallback(
    (experimentUuid: string) => {
      const newSelection = (
        selectedExperimentUuids.includes(experimentUuid)
          ? selectedExperimentUuids.filter((id) => id !== experimentUuid)
          : [...selectedExperimentUuids, experimentUuid]
      ).filter(Boolean)

      setSelectedExperimentUuids(newSelection)
    },
    [selectedExperimentUuids, setSelectedExperimentUuids],
  )

  const onCreateExperiments = useCallback(
    (experiments: { uuid: string }[]) => {
      setSelectedExperimentUuids(experiments.map((exp) => exp.uuid))
      setIsModalOpen(false)
    },
    [setSelectedExperimentUuids],
  )

  return (
    <MetadataProvider>
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

        {(count ?? initialCount) === 0 ? (
          <EmptyPage
            isCreatingExperiment={isCreatingExperiment}
            setIsModalOpen={setIsModalOpen}
          />
        ) : (
          <>
            <ExperimentComparison
              selectedExperimentUuids={selectedExperimentUuids}
              onUnselectExperiment={handleExperimentSelect}
            />
            <ExperimentsTable
              count={count ?? initialCount}
              selectedExperiments={selectedExperimentUuids}
              onSelectExperiment={handleExperimentSelect}
            />
          </>
        )}
        <RunExperimentModal
          project={project as Project}
          commit={commit as Commit}
          document={document}
          isOpen={isModalOpen}
          setOpen={setIsModalOpen}
          onCreate={onCreateExperiments}
        />
      </div>
    </MetadataProvider>
  )
}
