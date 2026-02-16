import {
  useCurrentCommit,
  type ICommitContextType,
} from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  useCurrentProject,
  type IProjectContextType,
} from '$/app/providers/ProjectProvider'
import EvaluationV2Form, {
  EvaluationV2FormErrors,
} from '$/components/evaluations/EvaluationV2Form'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  CompositeEvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  RuleEvaluationMetric,
} from '@latitude-data/core/constants'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useCallback, useState } from 'react'
import { EvaluationsGenerator } from './EvaluationsGenerator'

const DEFAULT_EVALUATION_SETTINGS = {
  name: 'Accuracy',
  description: 'Matches the expected output?',
  type: EvaluationType.Rule,
  metric: RuleEvaluationMetric.ExactMatch,
  configuration: {
    reverseScale: false,
    actualOutput: {
      messageSelection: 'last' as const,
      parsingFormat: 'string' as const,
    },
    expectedOutput: {
      parsingFormat: 'string' as const,
    },
    trigger: {
      target: 'every' as const,
    },
    caseInsensitive: false,
  },
}

const DEFAULT_EVALUATION_OPTIONS = {
  evaluateLiveLogs: true,
}

const DEFAULT_COMPOSITE_SETTINGS = {
  name: 'Performance',
  description: 'Measures the overall performance',
  type: EvaluationType.Composite as const,
  metric: CompositeEvaluationMetric.Average as const,
  configuration: {
    reverseScale: false,
    actualOutput: {
      messageSelection: 'last' as const,
      parsingFormat: 'string' as const,
    },
    expectedOutput: {
      parsingFormat: 'string' as const,
    },
    trigger: {
      target: 'every' as const,
    },
    evaluationUuids: [],
    minThreshold: 75,
  },
}

const DEFAULT_COMPOSITE_OPTIONS = {
  evaluateLiveLogs: false,
}

export function EvaluationsActions({
  createEvaluation,
  generateEvaluation,
  generatorEnabled,
  isCreatingEvaluation,
  isGeneratingEvaluation,
}: {
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  generateEvaluation: ReturnType<typeof useEvaluationsV2>['generateEvaluation']
  generatorEnabled: boolean
  isCreatingEvaluation: boolean
  isGeneratingEvaluation: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  return (
    <div className='flex flex-row items-center gap-4'>
      <CombineEvaluations
        project={project}
        commit={commit}
        document={document}
        createEvaluation={createEvaluation}
        isCreatingEvaluation={isCreatingEvaluation}
      />
      {generatorEnabled && (
        <GenerateEvaluation
          createEvaluation={createEvaluation}
          generateEvaluation={generateEvaluation}
          generatorEnabled={generatorEnabled}
          isCreatingEvaluation={isCreatingEvaluation}
          isGeneratingEvaluation={isGeneratingEvaluation}
        />
      )}
      <AddEvaluation
        project={project}
        commit={commit}
        document={document}
        createEvaluation={createEvaluation}
        isCreatingEvaluation={isCreatingEvaluation}
      />
    </div>
  )
}

function GenerateEvaluation({
  createEvaluation,
  generateEvaluation,
  generatorEnabled,
  isCreatingEvaluation,
  isGeneratingEvaluation,
}: {
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  generateEvaluation: ReturnType<typeof useEvaluationsV2>['generateEvaluation']
  generatorEnabled: boolean
  isCreatingEvaluation: boolean
  isGeneratingEvaluation: boolean
}) {
  const [openGenerateModal, setOpenGenerateModal] = useState(false)

  return (
    <>
      <TableWithHeader.Button
        onClick={() => setOpenGenerateModal(true)}
        disabled={!generatorEnabled}
      >
        Generate evaluation
      </TableWithHeader.Button>
      <EvaluationsGenerator
        open={openGenerateModal}
        setOpen={setOpenGenerateModal}
        createEvaluation={createEvaluation}
        generateEvaluation={generateEvaluation}
        generatorEnabled={generatorEnabled}
        isCreatingEvaluation={isCreatingEvaluation}
        isGeneratingEvaluation={isGeneratingEvaluation}
      />
    </>
  )
}

function AddEvaluation({
  project,
  commit,
  document,
  createEvaluation,
  isCreatingEvaluation,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  isCreatingEvaluation: boolean
}) {
  const navigate = useNavigate()

  const [openCreateModal, setOpenCreateModal] = useState(false)
  const [settings, setSettings] = useState<EvaluationSettings>(
    DEFAULT_EVALUATION_SETTINGS,
  )
  const [options, setOptions] = useState<Partial<EvaluationOptions>>(
    DEFAULT_EVALUATION_OPTIONS,
  )
  const [issueId, setIssueId] = useState<number | null>(null)
  const [errors, setErrors] = useState<EvaluationV2FormErrors>()

  const onCreate = useCallback(async () => {
    if (isCreatingEvaluation) return
    const [result, errors] = await createEvaluation({
      documentUuid: document.documentUuid,
      settings,
      options,
      issueId,
    })

    if (errors) {
      setErrors(errors)
    } else if (result?.evaluation) {
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
          .evaluations.detail({ uuid: evaluation.uuid }).root,
      )
    }
  }, [
    isCreatingEvaluation,
    createEvaluation,
    settings,
    options,
    issueId,
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
        disabled={isCreatingEvaluation}
      >
        Add evaluation
      </TableWithHeader.Button>
      <ConfirmModal
        size='medium'
        open={openCreateModal}
        title='Create a new evaluation'
        description='Evaluations help you assess the quality of your prompts.'
        onOpenChange={setOpenCreateModal}
        onConfirm={onCreate}
        confirm={{
          label: isCreatingEvaluation ? 'Creating...' : 'Create evaluation',
          disabled: isCreatingEvaluation,
          isConfirming: isCreatingEvaluation,
        }}
        onCancel={() => setOpenCreateModal(false)}
      >
        <EvaluationV2Form
          mode='create'
          settings={settings}
          setSettings={setSettings}
          issueId={issueId}
          setIssueId={setIssueId}
          options={options}
          setOptions={setOptions}
          errors={errors}
          commit={commit}
          disabled={isCreatingEvaluation}
        />
      </ConfirmModal>
    </>
  )
}

function CombineEvaluations({
  project,
  commit,
  document,
  createEvaluation,
  isCreatingEvaluation,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  isCreatingEvaluation: boolean
}) {
  const navigate = useNavigate()

  const [openCreateModal, setOpenCreateModal] = useState(false)
  const [settings, setSettings] = useState<
    EvaluationSettings<EvaluationType.Composite>
  >(DEFAULT_COMPOSITE_SETTINGS)
  const [options, setOptions] = useState<Partial<EvaluationOptions>>(
    DEFAULT_COMPOSITE_OPTIONS,
  )
  const [errors, setErrors] = useState<EvaluationV2FormErrors>()

  const onCreate = useCallback(async () => {
    if (isCreatingEvaluation) return
    const [result, errors] = await createEvaluation({
      settings,
      options,
      documentUuid: document.documentUuid,
    })

    if (errors) {
      setErrors(errors)
    } else if (result?.evaluation) {
      setSettings(DEFAULT_COMPOSITE_SETTINGS)
      setOptions(DEFAULT_COMPOSITE_OPTIONS)
      setErrors(undefined)
      setOpenCreateModal(false)

      const { evaluation } = result
      navigate.push(
        ROUTES.projects
          .detail({ id: project.id })
          .commits.detail({ uuid: commit.uuid })
          .documents.detail({ uuid: document.documentUuid })
          .evaluations.detail({ uuid: evaluation.uuid }).root,
      )
    }
  }, [
    isCreatingEvaluation,
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
        variant='ghost'
        fancy={false}
        textColor='foregroundMuted'
        onClick={() => setOpenCreateModal(true)}
        disabled={isCreatingEvaluation}
      >
        Combine evaluations
      </TableWithHeader.Button>
      <ConfirmModal
        dismissible
        size='medium'
        open={openCreateModal}
        title='Create a new composite score'
        description='Composite scores allow you to evaluate responses combining several evaluations at once.'
        onOpenChange={setOpenCreateModal}
        onConfirm={onCreate}
        confirm={{
          label: isCreatingEvaluation
            ? 'Creating...'
            : 'Create composite score',
          disabled: isCreatingEvaluation,
          isConfirming: isCreatingEvaluation,
        }}
        onCancel={() => setOpenCreateModal(false)}
      >
        <EvaluationV2Form
          mode='create'
          // No issueId/setIssueId because composite evals have no issue linking
          settings={settings}
          setSettings={setSettings}
          options={options}
          setOptions={setOptions}
          errors={errors}
          commit={commit}
          disabled={isCreatingEvaluation}
        />
      </ConfirmModal>
    </>
  )
}
