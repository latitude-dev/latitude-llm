import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { Commit, Project } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCallback, useState } from 'react'

import { type ActionsState } from '$/components/PlaygroundCommon/Actions'
import PreviewPrompt from '$/components/PlaygroundCommon/PreviewPrompt'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'

export default function Preview({
  metadata,
  parameters,
  runPrompt,
  expandParameters,
  setExpandParameters,
}: {
  metadata: ResolvedMetadata | undefined
  parameters: Record<string, unknown> | undefined
  runPrompt: () => void
} & ActionsState) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const [experimentModalOpen, setExperimentModalOpen] = useState(false)
  const onClickRunExperiment = useCallback(() => {
    setExperimentModalOpen(true)
  }, [setExperimentModalOpen])

  return (
    <>
      <PreviewPrompt
        showHeader={false}
        metadata={metadata}
        parameters={parameters}
        runPrompt={runPrompt}
        expandParameters={expandParameters}
        setExpandParameters={setExpandParameters}
        actions={
          <Button fancy variant='outline' onClick={onClickRunExperiment}>
            Run experiment
          </Button>
        }
      />
      <RunExperimentModal
        isOpen={experimentModalOpen}
        setOpen={setExperimentModalOpen}
        project={project as Project}
        commit={commit as Commit}
        document={document}
        navigateOnCreate
      />
    </>
  )
}
