import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCallback, useState } from 'react'

import { type ActionsState } from '$/components/PlaygroundCommon/Actions'
import PreviewPrompt from '$/components/PlaygroundCommon/PreviewPrompt'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Project } from '@latitude-data/core/schema/models/types/Project'
export default function Preview({
  metadata,
  parameters,
  runPrompt,
  debugMode,
  setDebugMode,
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
        debugMode={debugMode}
        setDebugMode={setDebugMode}
        actions={
          <Button
            variant='outline'
            onClick={onClickRunExperiment}
            fancy={true}
            roundy={true}
          >
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
