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
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import {
  ICommitContextType,
  IProjectContextType,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import Link from 'next/link'
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

  const { updateEvaluation, cloneEvaluation, isExecuting } = useEvaluationsV2({
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
          evaluation={evaluation as EvaluationV2<EvaluationType.Llm>}
          cloneEvaluation={cloneEvaluation}
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

function EditPrompt<M extends LlmEvaluationMetric>({
  project,
  commit,
  document,
  evaluation,
  cloneEvaluation,
  isExecuting,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<EvaluationType.Llm, M>
  cloneEvaluation: ReturnType<typeof useEvaluationsV2>['cloneEvaluation']
  isExecuting: boolean
}) {
  const navigate = useNavigate()

  const [openCloneModal, setOpenCloneModal] = useState(false)
  const onClone = useCallback(async () => {
    if (isExecuting) return
    const [result, errors] = await cloneEvaluation({
      evaluationUuid: evaluation.uuid,
    })
    if (errors) return
    setOpenCloneModal(false)

    navigate.push(
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid })
        .documents.detail({ uuid: document.documentUuid })
        .evaluationsV2.detail({ uuid: result.evaluation.uuid }).editor.root,
    )
  }, [
    isExecuting,
    cloneEvaluation,
    setOpenCloneModal,
    project,
    commit,
    document,
    evaluation,
    navigate,
  ])

  if (evaluation.metric === LlmEvaluationMetric.Custom) {
    return (
      <Link
        href={
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({ uuid: document.documentUuid })
            .evaluationsV2.detail({ uuid: evaluation.uuid }).editor.root
        }
        className={isExecuting ? 'pointer-events-none' : 'pointer-events-auto'}
      >
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
          disabled={isExecuting}
        >
          Edit prompt
        </TableWithHeader.Button>
      </Link>
    )
  }

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
        onClick={() => setOpenCloneModal(true)}
        disabled={isExecuting}
      >
        Edit prompt
      </TableWithHeader.Button>
      {openCloneModal && (
        <ConfirmModal
          dismissible
          open={openCloneModal}
          title={`Clone ${evaluation.name}`}
          onOpenChange={setOpenCloneModal}
          onConfirm={onClone}
          onCancel={() => setOpenCloneModal(false)}
          confirm={{
            label: isExecuting ? 'Cloning...' : `Clone ${evaluation.name}`,
            description: `The prompt of ${getEvaluationMetricSpecification(evaluation).name} evaluations cannot be edited. A new ${LlmEvaluationCustomSpecification.name} evaluation will be created.`,
            disabled: isExecuting,
            isConfirming: isExecuting,
          }}
        />
      )}
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
          setSettings={setSettings}
          options={options}
          setOptions={setOptions}
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
