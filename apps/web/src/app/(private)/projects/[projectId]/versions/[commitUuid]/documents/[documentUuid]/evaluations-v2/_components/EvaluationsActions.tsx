import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import EvaluationV2Form from '$/components/evaluations/EvaluationV2Form'
import { ActionErrors } from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  DocumentVersion,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  RuleEvaluationMetric,
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

const DEFAULT_EVALUATION_SETTINGS = {
  name: 'Accuracy',
  description: 'Matches the expected output?',
  type: EvaluationType.Rule,
  metric: RuleEvaluationMetric.ExactMatch,
  configuration: {
    reverseScale: false,
    caseInsensitive: false,
  },
}

const DEFAULT_EVALUATION_OPTIONS = {
  evaluateLiveLogs: true,
  enableSuggestions: true,
  autoApplySuggestions: true,
}

export function EvaluationsActions({
  createEvaluation,
  generatorEnabled,
  isExecuting,
}: {
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  generatorEnabled: boolean
  isExecuting: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  return (
    <div className='flex flex-row items-center gap-4'>
      {generatorEnabled && (
        <GenerateEvaluation
          project={project}
          commit={commit}
          document={document}
          createEvaluation={createEvaluation}
          isExecuting={isExecuting}
        />
      )}
      <AddEvaluation
        project={project}
        commit={commit}
        document={document}
        createEvaluation={createEvaluation}
        isExecuting={isExecuting}
      />
    </div>
  )
}

function GenerateEvaluation({
  isExecuting,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  isExecuting: boolean
}) {
  return (
    <>
      {/* TODO(evalsv2) */}
      <TableWithHeader.Button onClick={() => {}} disabled={isExecuting}>
        Generate evaluation
      </TableWithHeader.Button>
    </>
  )
}

function AddEvaluation({
  project,
  commit,
  document,
  createEvaluation,
  isExecuting,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  isExecuting: boolean
}) {
  const navigate = useNavigate()

  const [openCreateModal, setOpenCreateModal] = useState(false)
  const [settings, setSettings] = useState<EvaluationSettings>(
    DEFAULT_EVALUATION_SETTINGS,
  )
  const [options, setOptions] = useState<Partial<EvaluationOptions>>(
    DEFAULT_EVALUATION_OPTIONS,
  )
  const [errors, setErrors] =
    useState<ActionErrors<typeof useEvaluationsV2, 'createEvaluation'>>()

  const onCreate = useCallback(async () => {
    if (isExecuting) return
    const [result, errors] = await createEvaluation({ settings, options })
    if (errors) setErrors(errors)
    else {
      setSettings(DEFAULT_EVALUATION_SETTINGS)
      setOptions(DEFAULT_EVALUATION_OPTIONS)
      setErrors(undefined)
      setOpenCreateModal(false)

      const { evaluation } = result
      navigate.push(
        ROUTES.projects
          .detail({ id: project.id })
          .commits.detail({ uuid: commit.uuid })
          .documents.detail({ uuid: document.documentUuid })
          .evaluationsV2.detail({ uuid: evaluation.uuid }).root,
      )
    }
  }, [
    isExecuting,
    createEvaluation,
    settings,
    options,
    setSettings,
    setOptions,
    setErrors,
    setOpenCreateModal,
    project,
    commit,
    document,
    navigate,
  ])

  return (
    <>
      <TableWithHeader.Button
        variant='default'
        onClick={() => setOpenCreateModal(true)}
        disabled={isExecuting}
      >
        Add evaluation
      </TableWithHeader.Button>
      <ConfirmModal
        dismissible
        size='medium'
        open={openCreateModal}
        title='Create a new evaluation'
        description='Evaluations help you assess the quality of your prompts.'
        onOpenChange={setOpenCreateModal}
        onConfirm={onCreate}
        confirm={{
          label: isExecuting ? 'Creating...' : 'Create evaluation',
          disabled: isExecuting,
          isConfirming: isExecuting,
        }}
      >
        <EvaluationV2Form
          mode='create'
          settings={settings}
          setSettings={setSettings}
          options={options}
          setOptions={setOptions}
          errors={errors}
          disabled={isExecuting}
        />
      </ConfirmModal>
    </>
  )
}
