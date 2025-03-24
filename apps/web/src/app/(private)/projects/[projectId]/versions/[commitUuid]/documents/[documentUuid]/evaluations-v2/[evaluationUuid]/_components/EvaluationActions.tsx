import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import EvaluationV2Form from '$/components/evaluations/EvaluationV2Form'
import useEvaluationsV2 from '$/stores/evaluationsV2'
import {
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
} from '@latitude-data/constants'
import {
  ConfirmModal,
  TableWithHeader,
  Tooltip,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCallback, useState } from 'react'
import CreateBatchEvaluationModal from '../../../evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal'

export function EvaluationActions<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification.metrics[evaluation.metric]

  const [openUpdateModal, setOpenUpdateModal] = useState(false)
  const [settings, setSettings] = useState<EvaluationSettings<T, M>>(evaluation)
  const [options, setOptions] = useState<EvaluationOptions>(evaluation)
  const { updateEvaluation, isExecuting } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: document,
  })
  const onUpdate = useCallback(async () => {
    if (isExecuting || !!commit.mergedAt) return
    const result = await updateEvaluation({
      evaluationUuid: evaluation.uuid,
      settings: settings,
      options: options,
    })
    if (result) setOpenUpdateModal(false)
  }, [
    isExecuting,
    commit,
    evaluation,
    settings,
    options,
    updateEvaluation,
    setOpenUpdateModal,
  ])

  const [openBatchModal, setOpenBatchModal] = useState(false)

  return (
    <div className='flex flex-row items-center gap-4'>
      {commit.mergedAt ? (
        <Tooltip
          asChild
          trigger={
            <span>
              <TableWithHeader.Button variant='default' disabled>
                Edit evaluation
              </TableWithHeader.Button>
            </span>
          }
        >
          Merged commits cannot be edited.
        </Tooltip>
      ) : (
        <TableWithHeader.Button
          variant='default'
          onClick={() => setOpenUpdateModal(true)}
          disabled={isExecuting}
        >
          Edit evaluation
        </TableWithHeader.Button>
      )}
      <ConfirmModal
        dismissible
        open={openUpdateModal}
        title={`Update ${evaluation.name}`}
        description='Not all settings and options can be updated once the evaluation is created.'
        onOpenChange={setOpenUpdateModal}
        onConfirm={onUpdate}
        confirm={{
          label: isExecuting ? 'Updating...' : `Update ${evaluation.name}`,
          disabled: isExecuting || !!commit.mergedAt,
          isConfirming: isExecuting,
        }}
      >
        <EvaluationV2Form
          mode='update'
          settings={settings}
          onSettingsChange={setSettings}
          options={options}
          onOptionsChange={setOptions}
        />
      </ConfirmModal>
      {metricSpecification.supportsBatchEvaluation && (
        <>
          <TableWithHeader.Button onClick={() => setOpenBatchModal(true)}>
            Run batch evaluation
          </TableWithHeader.Button>
          <CreateBatchEvaluationModal
            open={openBatchModal}
            onClose={() => setOpenBatchModal(false)}
            document={document}
            evaluation={{ ...evaluation, version: 'v2' }}
            projectId={project.id.toString()}
            commitUuid={commit.uuid}
          />
        </>
      )}
    </div>
  )
}
