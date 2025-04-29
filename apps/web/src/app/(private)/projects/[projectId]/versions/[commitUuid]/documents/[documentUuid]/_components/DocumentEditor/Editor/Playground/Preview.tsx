import { useCallback, useState } from 'react'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useSearchParams } from 'next/navigation'
import { Commit, Project } from '@latitude-data/core/browser'
import { ConversationMetadata } from 'promptl-ai'
import { Button } from '@latitude-data/web-ui/atoms/Button'

import { useToggleModal } from '$/hooks/useToogleModal'
import RunPromptInBatchModal from './RunPromptInBatchModal'
import { BATCH_MODAL_NAME } from '../../../constants'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { type ActionsState } from '$/components/PlaygroundCommon/Actions'
import PreviewPrompt from '$/components/PlaygroundCommon/PreviewPrompt'

export default function Preview({
  metadata,
  parameters,
  runPrompt,
  expandParameters,
  setExpandParameters,
}: {
  metadata: ConversationMetadata | undefined
  parameters: Record<string, unknown> | undefined
  runPrompt: () => void
} & ActionsState) {
  const params = useSearchParams()
  const openBatch = params.get('modal') === BATCH_MODAL_NAME
  const runModal = useToggleModal({ initialState: openBatch })
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { enabled: newExperimentsEnabled } = useFeatureFlag({
    featureFlag: 'experiments',
  })
  const [experimentModalOpen, setExperimentModalOpen] = useState(false)
  const onOpenRunModal = runModal.onOpen
  const onClickRunExperiment = useCallback(() => {
    if (newExperimentsEnabled) {
      setExperimentModalOpen(true)
    } else {
      onOpenRunModal()
    }
  }, [newExperimentsEnabled, onOpenRunModal, setExperimentModalOpen])

  return (
    <>
      <PreviewPrompt
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
      {runModal.open ? (
        <RunPromptInBatchModal
          document={document}
          onClose={runModal.onClose}
          onOpenChange={runModal.onOpenChange}
        />
      ) : null}
    </>
  )
}
