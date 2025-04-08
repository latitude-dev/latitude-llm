import EvaluationV2Form from '$/components/evaluations/EvaluationV2Form'
import { ActionErrors } from '$/hooks/useLatitudeAction'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  RuleEvaluationMetric,
} from '@latitude-data/core/browser'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
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
    const [_, errors] = await createEvaluation({ settings, options })
    if (errors) setErrors(errors)
    else {
      setSettings(DEFAULT_EVALUATION_SETTINGS)
      setOptions(DEFAULT_EVALUATION_OPTIONS)
      setErrors(undefined)
      setOpenCreateModal(false)
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
  ])

  return (
    <div className='flex flex-row items-center gap-4'>
      {generatorEnabled && (
        <>
          {/* TODO(evalsv2) */}
          <TableWithHeader.Button onClick={() => {}} disabled={isExecuting}>
            Generate evaluation
          </TableWithHeader.Button>
        </>
      )}
      <TableWithHeader.Button
        variant='default'
        onClick={() => setOpenCreateModal(true)}
        disabled={isExecuting}
      >
        Add evaluation
      </TableWithHeader.Button>
      <ConfirmModal
        dismissible
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
          onSettingsChange={setSettings}
          options={options}
          onOptionsChange={setOptions}
          errors={errors}
          disabled={isExecuting}
        />
      </ConfirmModal>
    </div>
  )
}
