import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import EvaluationV2Form from '$/components/evaluations/EvaluationV2Form'
import { ActionErrors } from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  Commit,
  DocumentVersion,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  Project,
} from '@latitude-data/core/browser'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import {
  ICommitContextType,
  IProjectContextType,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback, useState } from 'react'
import CreateBatchEvaluationModal from '../../../evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

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

  const { createEvaluation, updateEvaluation, isExecuting } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: document,
  })

  return (
    <div className='flex flex-row items-center gap-4'>
      {evaluation.type === EvaluationType.Llm && (
        <EditPrompt
          project={project}
          commit={commit}
          document={document}
          evaluation={evaluation}
          createEvaluation={createEvaluation}
          isExecuting={isExecuting}
        />
      )}
      <EditEvaluation
        project={project}
        commit={commit}
        document={document}
        evaluation={evaluation}
        updateEvaluation={updateEvaluation}
        isExecuting={isExecuting}
      />
      {metricSpecification.supportsBatchEvaluation && (
        <RunExperiment
          project={project}
          commit={commit}
          document={document}
          evaluation={evaluation}
          isExecuting={isExecuting}
        />
      )}
    </div>
  )
}

function EditPrompt<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  project,
  commit,
  document,
  evaluation,
  createEvaluation,
  isExecuting,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<T, M>
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  isExecuting: boolean
}) {
  const navigate = useNavigate()

  // TODO(evalsv2): Clone eval or go to prompt editor if its a custom llm eval

  const [openCloneModal, setOpenCloneModal] = useState(false)

  const onClone = useCallback(async () => {
    if (isExecuting) return
    const [result, errors] = await createEvaluation({
      settings: evaluation,
      options: evaluation,
    })
    if (errors) return

    setOpenCloneModal(false)

    navigate.push(
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid })
        .documents.detail({ uuid: document.documentUuid })
        .evaluationsV2.detail({ uuid: result.evaluation.uuid }).root,
    )
  }, [
    isExecuting,
    createEvaluation,
    evaluation,
    setOpenCloneModal,
    project,
    commit,
    document,
    navigate,
  ])

  return (
    <>
      <TableWithHeader.Button
        variant='link'
        size='none'
        fancy={false}
        iconProps={{
          name: 'arrowUpRight',
          widthClass: 'w-4',
          heightClass: 'h-4',
          placement: 'right',
        }}
        // TODO(evalsv2): Clone eval or go to prompt editor if its a custom llm eval
        // onClick={() => setOpenCloneModal(true)}
        disabled={isExecuting}
      >
        Edit prompt
      </TableWithHeader.Button>
      <ConfirmModal
        dismissible
        open={openCloneModal}
        title={`Clone ${evaluation.name}`}
        description='TODO'
        onOpenChange={setOpenCloneModal}
        onConfirm={onClone}
        confirm={{
          label: isExecuting ? 'Cloning...' : `Clone ${evaluation.name}`,
          disabled: isExecuting || !!commit.mergedAt,
          isConfirming: isExecuting,
        }}
      >
        TODO
      </ConfirmModal>
    </>
  )
}

function EditEvaluation<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  commit,
  evaluation,
  updateEvaluation,
  isExecuting,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<T, M>
  updateEvaluation: ReturnType<typeof useEvaluationsV2>['updateEvaluation']
  isExecuting: boolean
}) {
  const [openUpdateModal, setOpenUpdateModal] = useState(false)
  const [settings, setSettings] = useState<EvaluationSettings<T, M>>(evaluation)
  const [options, setOptions] = useState<EvaluationOptions>(evaluation)
  const [errors, setErrors] =
    useState<ActionErrors<typeof useEvaluationsV2, 'updateEvaluation'>>()

  const onUpdate = useCallback(async () => {
    if (isExecuting || !!commit.mergedAt) return
    const [_, errors] = await updateEvaluation({
      evaluationUuid: evaluation.uuid,
      settings: settings,
      options: options,
    })
    if (errors) setErrors(errors)
    else {
      setErrors(undefined)
      setOpenUpdateModal(false)
    }
  }, [
    isExecuting,
    commit,
    evaluation,
    settings,
    options,
    updateEvaluation,
    setErrors,
    setOpenUpdateModal,
  ])

  return (
    <>
      <TableWithHeader.Button
        onClick={() => setOpenUpdateModal(true)}
        disabled={isExecuting}
      >
        Edit evaluation
      </TableWithHeader.Button>
      <ConfirmModal
        dismissible
        open={openUpdateModal}
        title={`Update ${evaluation.name}`}
        description={
          commit.mergedAt
            ? 'Merged commits cannot be edited.'
            : 'Not all settings and options can be updated once the evaluation is created.'
        }
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
          errors={errors}
          disabled={isExecuting || !!commit.mergedAt}
        />
      </ConfirmModal>
    </>
  )
}

function RunExperiment<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  project,
  commit,
  document,
  evaluation,
  isExecuting,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<T, M>
  isExecuting: boolean
}) {
  const [open, setOpen] = useState(false)

  const { enabled: experimentsEnabled } = useFeatureFlag({
    featureFlag: 'experiments',
  })

  return (
    <>
      <TableWithHeader.Button
        variant='default'
        onClick={() => setOpen(true)}
        disabled={isExecuting}
      >
        Run experiment
      </TableWithHeader.Button>
      {experimentsEnabled ? (
        <RunExperimentModal
          project={project as Project}
          commit={commit as Commit}
          document={document}
          isOpen={open}
          setOpen={setOpen}
          initialEvaluation={evaluation}
        />
      ) : (
        <CreateBatchEvaluationModal
          open={open}
          onClose={() => setOpen(false)}
          projectId={project.id.toString()}
          commitUuid={commit.uuid}
          document={document}
          evaluation={{ ...evaluation, version: 'v2' }}
        />
      )}
    </>
  )
}
