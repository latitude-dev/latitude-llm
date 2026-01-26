import {
  useCurrentCommit,
  type ICommitContextType,
} from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import {
  useCurrentProject,
  type IProjectContextType,
} from '$/app/providers/ProjectProvider'
import {
  EVALUATION_SPECIFICATIONS,
  getEvaluationMetricSpecification,
} from '$/components/evaluations'
import EvaluationV2Form, {
  EvaluationV2FormErrors,
} from '$/components/evaluations/EvaluationV2Form'
import { MetadataProvider } from '$/components/MetadataProvider'
import { RunExperimentModal } from '$/components/RunExperimentModal'
import { useNavigate } from '$/hooks/useNavigate'
import { useToggleModal } from '$/hooks/useToogleModal'
import { ROUTES } from '$/services/routes'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationCustomSpecification,
  LlmEvaluationMetric,
} from '@latitude-data/core/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useSearchParams } from 'next/navigation'
import { RefObject, useCallback, useMemo, useState } from 'react'

export function EvaluationActions<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  openSettingsRef,
}: {
  openSettingsRef?: RefObject<(() => void) | undefined>
}) {
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
        openSettingsRef={openSettingsRef}
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
        .evaluations.detail({ uuid: evaluationUuid }),
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
    cloneModal,
    navigate,
    evaluation.uuid,
  ])

  const onClone = useCallback(async () => {
    if (isCloningEvaluation) return
    const [result, errors] = await cloneEvaluation({
      documentUuid: document.documentUuid,
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
    navigate,
    baseEvaluationRoute,
    cloneModal,
    document.documentUuid,
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
          label: isCloningEvaluation ? 'Cloning...' : 'Clone',
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
  openSettingsRef,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<T, M>
  updateEvaluation: ReturnType<typeof useEvaluationsV2>['updateEvaluation']
  isUpdatingEvaluation: boolean
  openSettingsRef?: RefObject<(() => void) | undefined>
}) {
  const { document } = useCurrentDocument()

  const [openUpdateModal, setOpenUpdateModal] = useState(
    useSearchParams().has('action', 'editSettings'),
  )
  if (openSettingsRef) openSettingsRef.current = () => setOpenUpdateModal(true)

  const [settings, setSettings] = useState<EvaluationSettings<T, M>>(evaluation)
  const [issueId, setIssueId] = useState<number | null>(
    evaluation.issueId ?? null,
  )
  const [options, setOptions] = useState<EvaluationOptions>(evaluation)
  const [errors, setErrors] = useState<EvaluationV2FormErrors>()

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification.metrics[evaluation.metric]

  const isMainEvaluation = useMemo(
    () => evaluation.uuid === document.mainEvaluationUuid,
    [evaluation.uuid, document.mainEvaluationUuid],
  )

  const onUpdate = useCallback(async () => {
    if (isUpdatingEvaluation) return
    if (isMainEvaluation) return

    const [_, errors] = await updateEvaluation({
      documentUuid: document.documentUuid,
      evaluationUuid: evaluation.uuid,
      settings: settings,
      issueId: issueId,
      options: options,
    })
    if (errors) {
      setErrors(errors)
    } else {
      setErrors(undefined)
      setOpenUpdateModal(false)
    }
  }, [
    isUpdatingEvaluation,
    isMainEvaluation,
    evaluation,
    settings,
    issueId,
    options,
    updateEvaluation,
    setErrors,
    setOpenUpdateModal,
    document.documentUuid,
  ])

  return (
    <>
      <TableWithHeader.Button
        onClick={() => setOpenUpdateModal(true)}
        disabled={isUpdatingEvaluation}
      >
        Settings
      </TableWithHeader.Button>
      <ConfirmModal
        dismissible
        size='medium'
        open={openUpdateModal}
        icon={metricSpecification.icon}
        title={`Update ${evaluation.name}`}
        description={
          commit.mergedAt
            ? undefined
            : 'Not all settings and options can be updated once the evaluation is created.'
        }
        onOpenChange={setOpenUpdateModal}
        onConfirm={onUpdate}
        onCancel={() => setOpenUpdateModal(false)}
        confirm={{
          label: isUpdatingEvaluation ? 'Updating...' : 'Update evaluation',
          disabled: isMainEvaluation || isUpdatingEvaluation,
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
          uuid={evaluation.uuid}
          settings={settings}
          setSettings={setSettings}
          issueId={issueId}
          setIssueId={setIssueId}
          options={options}
          setOptions={setOptions}
          errors={errors}
          commit={commit}
          disabled={isUpdatingEvaluation || isMainEvaluation}
        />
        {isMainEvaluation && (
          <Alert
            variant='warning'
            title='This evaluation is automatically managed by the system and cannot be edited.'
            description='This evaluation is automatically managed by the system and cannot be edited.'
          />
        )}
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

  return (
    <MetadataProvider>
      <TableWithHeader.Button variant='default' onClick={() => setOpen(true)}>
        Run experiment
      </TableWithHeader.Button>
      <RunExperimentModal
        project={project as Project}
        commit={commit as Commit}
        document={document}
        isOpen={open}
        setOpen={setOpen}
        initialEvaluation={evaluation}
        navigateOnCreate
      />
    </MetadataProvider>
  )
}
