import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import {
  EVALUATION_SPECIFICATIONS,
  getEvaluationMetricSpecification,
} from '$/components/evaluations'
import EvaluationV2Form from '$/components/evaluations/EvaluationV2Form'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import { ActionErrors } from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { useToggleModal } from '$/hooks/useToogleModal'
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
  LlmEvaluationCustomSpecification,
  LlmEvaluationMetric,
  Project,
} from '@latitude-data/core/browser'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
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

  const {
    updateEvaluation,
    isUpdatingEvaluation,
    cloneEvaluation,
    isCloningEvaluation,
  } = useEvaluationsV2({ project, commit, document })

  return (
    <div className='flex flex-row items-center gap-4'>
      {evaluation.type === EvaluationType.Llm && (
        <EditPrompt
          project={project}
          commit={commit}
          document={document}
          evaluation={
            evaluation as EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric>
          }
          cloneEvaluation={cloneEvaluation}
          isCloningEvaluation={isCloningEvaluation}
        />
      )}
      <EditEvaluation
        project={project}
        commit={commit}
        document={document}
        evaluation={evaluation}
        updateEvaluation={updateEvaluation}
        isUpdatingEvaluation={isUpdatingEvaluation}
      />
      {metricSpecification.supportsBatchEvaluation && (
        <RunExperiment
          project={project}
          commit={commit}
          document={document}
          evaluation={evaluation}
        />
      )}
    </div>
  )
}

function EditPrompt<M extends LlmEvaluationMetric>({
  project,
  commit,
  document,
  evaluation,
  cloneEvaluation,
  isCloningEvaluation,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<EvaluationType.Llm, M>
  cloneEvaluation: ReturnType<typeof useEvaluationsV2>['cloneEvaluation']
  isCloningEvaluation: boolean
}) {
  const navigate = useNavigate()
  const cloneModal = useToggleModal()

  const baseEvaluationRoute = useCallback(
    ({ evaluationUuid }: { evaluationUuid: string }) =>
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid })
        .documents.detail({ uuid: document.documentUuid })
        .evaluationsV2.detail({ uuid: evaluationUuid }),
    [project.id, commit.uuid, document.documentUuid],
  )

  const onClickEditPrompt = useCallback(() => {
    if (evaluation.metric.startsWith(LlmEvaluationMetric.Custom)) {
      return navigate.push(
        baseEvaluationRoute({ evaluationUuid: evaluation.uuid }).editor.root,
      )
    }

    return cloneModal.onOpen()
  }, [
    evaluation.metric,
    baseEvaluationRoute,
    cloneModal.onOpen,
    navigate,
    evaluation.uuid,
  ])

  const onClone = useCallback(async () => {
    if (isCloningEvaluation) return
    const [result, errors] = await cloneEvaluation({
      evaluationUuid: evaluation.uuid,
    })
    if (errors) return

    cloneModal.onClose()

    const newEvaluationUrl = baseEvaluationRoute({
      evaluationUuid: result.evaluation.uuid,
    }).editor.root
    navigate.push(newEvaluationUrl)
  }, [
    isCloningEvaluation,
    cloneEvaluation,
    evaluation,
    cloneModal.onClose,
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
        onClick={onClickEditPrompt}
        disabled={isCloningEvaluation}
      >
        Edit prompt
      </TableWithHeader.Button>
      <ConfirmModal
        dismissible
        open={cloneModal.open}
        title={`Clone ${evaluation.name}`}
        onOpenChange={cloneModal.onOpenChange}
        onConfirm={onClone}
        onCancel={cloneModal.onClose}
        confirm={{
          label: isCloningEvaluation
            ? 'Cloning...'
            : `Clone ${evaluation.name}`,
          description: `The prompt of ${getEvaluationMetricSpecification(evaluation).name} evaluations cannot be edited. A new ${LlmEvaluationCustomSpecification.name} evaluation will be created.`,
          disabled: isCloningEvaluation,
          isConfirming: isCloningEvaluation,
        }}
      />
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
  isUpdatingEvaluation,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<T, M>
  updateEvaluation: ReturnType<typeof useEvaluationsV2>['updateEvaluation']
  isUpdatingEvaluation: boolean
}) {
  const [openUpdateModal, setOpenUpdateModal] = useState(false)
  const [settings, setSettings] = useState<EvaluationSettings<T, M>>(evaluation)
  const [options, setOptions] = useState<EvaluationOptions>(evaluation)
  const [errors, setErrors] =
    useState<ActionErrors<typeof useEvaluationsV2, 'updateEvaluation'>>()

  const onUpdate = useCallback(async () => {
    if (isUpdatingEvaluation) return
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
    isUpdatingEvaluation,
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
        disabled={isUpdatingEvaluation}
      >
        Edit evaluation
      </TableWithHeader.Button>
      <ConfirmModal
        dismissible
        size='medium'
        open={openUpdateModal}
        title={`Update ${evaluation.name}`}
        description={
          commit.mergedAt
            ? undefined
            : 'Not all settings and options can be updated once the evaluation is created.'
        }
        onOpenChange={setOpenUpdateModal}
        onConfirm={onUpdate}
        confirm={{
          label: isUpdatingEvaluation
            ? 'Updating...'
            : `Update ${evaluation.name}`,
          disabled: isUpdatingEvaluation,
          isConfirming: isUpdatingEvaluation,
        }}
      >
        {!!commit.mergedAt && (
          <Alert
            variant='warning'
            title='Version published'
            description='Only options can be updated in a published commit. Create a draft to edit the evaluation.'
          />
        )}
        <EvaluationV2Form
          mode='update'
          settings={settings}
          setSettings={setSettings}
          options={options}
          setOptions={setOptions}
          errors={errors}
          commit={commit}
          disabled={isUpdatingEvaluation}
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
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<T, M>
}) {
  const [open, setOpen] = useState(false)

  const { enabled: experimentsEnabled } = useFeatureFlag({
    featureFlag: 'experiments',
  })

  return (
    <>
      <TableWithHeader.Button variant='default' onClick={() => setOpen(true)}>
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
          navigateOnCreate
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
