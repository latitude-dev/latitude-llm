import {
  useCurrentCommit,
  type ICommitContextType,
} from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  useCurrentProject,
  type IProjectContextType,
} from '$/app/providers/ProjectProvider'
import { useOptimizations } from '$/stores/optimizations'
import { OptimizationConfiguration } from '@latitude-data/core/constants'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useCallback, useState } from 'react'
import {
  OptimizationForm,
  type OptimizationFormErrors,
} from './OptimizationForm'
import { OPTIMIZATION_PRESETS } from './OptimizationForm/PresetSelector'

const DEFAULT_CONFIGURATION = {
  ...OPTIMIZATION_PRESETS.balanced.configuration,
  simulation: {
    simulateToolResponses: true,
    simulatedTools: [], // Note: empty array means all tools are simulated
    toolSimulationInstructions: '',
  },
  scope: {
    instructions: true,
  },
}

export function OptimizationsActions({
  openStartModal,
  setOpenStartModal,
  startOptimization,
  isStartingOptimization,
}: {
  openStartModal: boolean
  setOpenStartModal: (open: boolean) => void
  startOptimization: ReturnType<typeof useOptimizations>['startOptimization']
  isStartingOptimization: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  return (
    <div className='flex flex-row items-center gap-4'>
      <StartOptimization
        project={project}
        commit={commit}
        document={document}
        openStartModal={openStartModal}
        setOpenStartModal={setOpenStartModal}
        startOptimization={startOptimization}
        isStartingOptimization={isStartingOptimization}
      />
    </div>
  )
}

function StartOptimization({
  commit,
  openStartModal,
  setOpenStartModal,
  startOptimization,
  isStartingOptimization,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  openStartModal: boolean
  setOpenStartModal: (open: boolean) => void
  startOptimization: ReturnType<typeof useOptimizations>['startOptimization']
  isStartingOptimization: boolean
}) {
  const [evaluationUuid, setEvaluationUuid] = useState<string>()
  const [datasetId, setDatasetId] = useState<number>()
  const [configuration, setConfiguration] = useState<OptimizationConfiguration>(DEFAULT_CONFIGURATION) // prettier-ignore
  const [errors, setErrors] = useState<OptimizationFormErrors>()

  const onStart = useCallback(async () => {
    if (isStartingOptimization) return
    const [result, errors] = await startOptimization({
      commitUuid: commit.uuid,
      evaluationUuid: evaluationUuid as string,
      datasetId: datasetId,
      configuration: configuration,
    })
    if (errors) {
      setErrors(errors)
    } else if (result?.optimization) {
      setEvaluationUuid(undefined)
      setDatasetId(undefined)
      setConfiguration(DEFAULT_CONFIGURATION)
      setErrors(undefined)
      setOpenStartModal(false)
    }
  }, [
    isStartingOptimization,
    startOptimization,
    commit,
    evaluationUuid,
    datasetId,
    configuration,
    setEvaluationUuid,
    setDatasetId,
    setConfiguration,
    setErrors,
    setOpenStartModal,
  ])

  return (
    <>
      <TableWithHeader.Button
        variant='default'
        onClick={() => setOpenStartModal(true)}
        disabled={isStartingOptimization}
      >
        Start optimization
      </TableWithHeader.Button>
      <ConfirmModal
        dismissible
        size='medium'
        open={openStartModal}
        title='Start a new optimization'
        description='Optimizations help you improve the quality of your prompts'
        onOpenChange={setOpenStartModal}
        onConfirm={onStart}
        confirm={{
          label: isStartingOptimization ? 'Starting...' : 'Start optimization',
          disabled: isStartingOptimization,
          isConfirming: isStartingOptimization,
        }}
        onCancel={() => setOpenStartModal(false)}
      >
        <OptimizationForm
          evaluationUuid={evaluationUuid}
          setEvaluationUuid={setEvaluationUuid}
          datasetId={datasetId}
          setDatasetId={setDatasetId}
          configuration={configuration}
          setConfiguration={setConfiguration}
          errors={errors}
          disabled={isStartingOptimization}
        />
      </ConfirmModal>
    </>
  )
}
