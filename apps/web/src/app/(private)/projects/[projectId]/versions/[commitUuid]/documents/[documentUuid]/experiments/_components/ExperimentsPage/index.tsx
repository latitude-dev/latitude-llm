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
import { useState } from 'react'

export function ExperimentsPageContent() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { isCreating: isCreatingExperiment } = useExperiments({
    projectId: project.id,
    documentUuid: document.documentUuid,
  })

  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div className='w-full p-6 flex flex-col gap-2'>
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

      <ExperimentsTable />
      <RunExperimentModal
        project={project as Project}
        commit={commit as Commit}
        document={document}
        isOpen={isModalOpen}
        setOpen={setIsModalOpen}
      />
    </div>
  )
}
