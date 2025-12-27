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
import { OptimizationForm, OptimizationFormErrors } from './OptimizationForm'

// TODO(AO/OPT): Review & implement
const DEFAULT_OPTIMIZATION_CONFIGURATION = {}

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

// TODO(AO/OPT): Implement
function StartOptimization({
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
  const [configuration, setConfiguration] = useState<OptimizationConfiguration>(DEFAULT_OPTIMIZATION_CONFIGURATION) // prettier-ignore
  const [goldsetId, setGoldsetId] = useState<number>()
  const [evaluationUuid, setEvaluationUuid] = useState<string>()
  const [errors, setErrors] = useState<OptimizationFormErrors>()

  const onStart = useCallback(async () => {
    if (isStartingOptimization) return
    const [result, errors] = await startOptimization({
      configuration: configuration,
      goldsetId: goldsetId,
      evaluationUuid: evaluationUuid as string,
    })

    if (errors) {
      setErrors(errors)
    } else if (result?.optimization) {
      setConfiguration(DEFAULT_OPTIMIZATION_CONFIGURATION)
      setGoldsetId(undefined)
      setEvaluationUuid(undefined)
      setErrors(undefined)
      setOpenStartModal(false)
    }
  }, [
    isStartingOptimization,
    startOptimization,
    configuration,
    goldsetId,
    evaluationUuid,
    setConfiguration,
    setGoldsetId,
    setEvaluationUuid,
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
          configuration={configuration}
          setConfiguration={setConfiguration}
          goldsetId={goldsetId}
          setGoldsetId={setGoldsetId}
          evaluationUuid={evaluationUuid}
          setEvaluationUuid={setEvaluationUuid}
          errors={errors}
          disabled={isStartingOptimization}
        />
      </ConfirmModal>
    </>
  )
}
