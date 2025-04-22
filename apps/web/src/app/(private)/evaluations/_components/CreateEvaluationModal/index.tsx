import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import EvaluationV2Form from '$/components/evaluations/EvaluationV2Form'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { ActionErrors } from '$/hooks/useLatitudeAction'
import useEvaluations from '$/stores/evaluations'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationMetadataType,
  EvaluationOptions,
  EvaluationResultableType,
  EvaluationResultConfiguration,
  EvaluationSettings,
  EvaluationType,
  LlmEvaluationMetric,
  LlmEvaluationSpecification,
  RuleEvaluationMetric,
  RuleEvaluationSpecification,
} from '@latitude-data/core/browser'
import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { SelectableCard } from '@latitude-data/web-ui/molecules/SelectableCard'
import { TabSelector } from '@latitude-data/web-ui/molecules/TabSelector'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEvaluationConfiguration } from './useEvaluationConfiguration'

type EvaluationMetadataTypeTmp =
  | EvaluationMetadataType
  | 'evaluationV2_rule'
  | 'evaluationV2_llm'

const METADATA_TYPE_DESCRIPTIONS = {
  [EvaluationMetadataType.LlmAsJudgeSimple]:
    'Use AI to automatically evaluate your logs based on predefined criteria',
  [EvaluationMetadataType.LlmAsJudgeAdvanced]:
    'Use AI to automatically evaluate your logs based on predefined criteria',
  [EvaluationMetadataType.Manual]:
    'Use your own evaluation logic and push evaluation results to Latitude with our SDK or HTTP API',
  evaluationV2_rule: RuleEvaluationSpecification.description,
  evaluationV2_llm: LlmEvaluationSpecification.description,
}

const DEFAULT_RULE_SETTINGS_V2 = {
  name: 'Accuracy',
  description: 'Matches the expected output?',
  type: EvaluationType.Rule,
  metric: RuleEvaluationMetric.ExactMatch,
  configuration: {
    reverseScale: false,
    caseInsensitive: false,
  },
}

const DEFAULT_LLM_SETTINGS_V2 = {
  name: `Accuracy`,
  description: `Evaluates how well the given instructions are followed.`,
  type: EvaluationType.Llm,
  metric: LlmEvaluationMetric.Rating,
  configuration: {
    reverseScale: false,
    provider: undefined,
    model: undefined,
    criteria: 'Assess how well the response follows the given instructions.',
    minRating: 1,
    minRatingDescription: "Not faithful, doesn't follow the instructions.",
    maxRating: 5,
    maxRatingDescription: 'Very faithful, does follow the instructions.',
    minThreshold: 3,
  },
}

const DEFAULT_OPTIONS_V2 = {
  evaluateLiveLogs: true,
  enableSuggestions: true,
  autoApplySuggestions: true,
}

export type CreateEvaluationData = {
  title: string
  description: string
  prompt: string
  configuration: EvaluationResultConfiguration
}

export default function CreateEvaluationModal({
  data: initialData,
  onClose,
}: {
  data?: CreateEvaluationData
  onClose: ReactStateDispatch<number | null>
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { enabled: experimentsEnabled } = useFeatureFlag({
    featureFlag: 'experiments',
  })

  const METADATA_TYPE_OPTIONS = [
    ...(experimentsEnabled
      ? [
          {
            label: 'LLM as judge',
            value: 'evaluationV2_llm',
          },
        ]
      : [
          {
            label: 'LLM as judge',
            value:
              EvaluationMetadataType.LlmAsJudgeSimple as EvaluationMetadataTypeTmp,
          },
        ]),
    {
      label: 'Code / Manual',
      value: EvaluationMetadataType.Manual as EvaluationMetadataTypeTmp,
    },
    {
      label: 'Rule',
      value: 'evaluationV2_rule',
    },
  ]

  const [title, setTitle] = useState(initialData?.title ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [prompt, setPrompt] = useState(initialData?.prompt ?? '')
  const [metadataType, setMetadataType] = useState<EvaluationMetadataTypeTmp>(
    experimentsEnabled
      ? 'evaluationV2_llm'
      : EvaluationMetadataType.LlmAsJudgeSimple,
  )
  const {
    configuration,
    handleTypeChange,
    handleRangeFromChange,
    handleRangeToChange,
  } = useEvaluationConfiguration(initialData?.configuration)

  useEffect(() => {
    if (!initialData) return
    setTitle(initialData?.title ?? '')
    setDescription(initialData?.description ?? '')
    setPrompt(initialData?.prompt ?? '')
  }, [initialData])

  const {
    data: existingEvaluations,
    isLoading,
    create,
    isCreating: isCreatingEvaluation,
  } = useEvaluations({
    onSuccessCreate: (newEvaluation) => {
      if (!newEvaluation) return // should never happen but it does
      onClose(null)
    },
    params: { documentUuid: document?.documentUuid },
  })

  const [settingsV2, setSettingsV2] = useState<EvaluationSettings>(
    experimentsEnabled ? DEFAULT_LLM_SETTINGS_V2 : DEFAULT_RULE_SETTINGS_V2,
  )
  const [optionsV2, setOptionsV2] =
    useState<Partial<EvaluationOptions>>(DEFAULT_OPTIONS_V2)
  const [errorsV2, setErrorsV2] =
    useState<ActionErrors<typeof useEvaluationsV2, 'createEvaluation'>>(
      undefined,
    )

  const {
    createEvaluation: createEvaluationV2,
    isCreatingEvaluation: isCreatingEvaluationV2,
  } = useEvaluationsV2({ project, commit, document })

  const isCreating = isCreatingEvaluation || isCreatingEvaluationV2

  const onConfirm = useCallback(async () => {
    if (isLoading || isCreating) return

    if (metadataType.startsWith('evaluationV2')) {
      const [_, errors] = await createEvaluationV2({
        settings: settingsV2,
        options: optionsV2,
      })

      if (errors) {
        setErrorsV2(errors)
      } else {
        setSettingsV2(
          metadataType === 'evaluationV2_llm'
            ? DEFAULT_LLM_SETTINGS_V2
            : DEFAULT_RULE_SETTINGS_V2,
        )
        setOptionsV2(DEFAULT_OPTIONS_V2)
        onClose(null)
      }

      return
    }

    const resultConfiguration =
      configuration.type === EvaluationResultableType.Number
        ? {
            type: configuration.type,
            minValue: configuration.detail!.range.from,
            maxValue: configuration.detail!.range.to,
          }
        : { type: configuration.type }

    let result
    if (prompt) {
      result = await create({
        name: title,
        description,
        metadata: {
          type: EvaluationMetadataType.LlmAsJudgeAdvanced,
          prompt,
        },
        resultConfiguration,
      })
    } else if (metadataType === EvaluationMetadataType.LlmAsJudgeSimple) {
      result = await create({
        name: title,
        description,
        metadata: {
          type: EvaluationMetadataType.LlmAsJudgeSimple,
          objective: '',
          additionalInstructions: '',
        },
        resultConfiguration,
      })
    } else {
      result = await create({
        name: title,
        description,
        resultConfiguration,
        metadata: {
          type: EvaluationMetadataType.Manual,
        },
      })
    }

    if (result) onClose(null)
  }, [
    create,
    onClose,
    title,
    description,
    prompt,
    configuration,
    metadataType,
    createEvaluationV2,
    settingsV2,
    optionsV2,
  ])

  const titleError = useMemo<string | undefined>(() => {
    if (metadataType.startsWith('evaluationV2')) return undefined
    if (!title) return 'Please enter a name for your evaluation.'
    if (existingEvaluations?.find((e) => e.name === title))
      return 'There is already an evaluation with this name. Please choose a different name.'
    return undefined
  }, [metadataType, existingEvaluations, title])

  return (
    <ConfirmModal
      dismissible
      open={!!initialData}
      title='Create New Evaluation'
      description='Evaluations allow you to analyze logs and assign them metrics such as scores, categories, or boolean values.'
      onOpenChange={() => onClose(null)}
      onConfirm={onConfirm}
      confirm={{
        label: isCreating ? 'Creating...' : 'Create evaluation',
        description:
          prompt &&
          'A prompt is included with this template. You can edit it once you create the evaluation.',
        disabled: isLoading || isCreating || !!titleError,
        isConfirming: isCreating,
      }}
    >
      {metadataType.startsWith('evaluationV2') ? (
        <>
          <FormField className='w-full'>
            <div className='flex flex-col gap-2'>
              <TabSelector
                fullWidth
                options={METADATA_TYPE_OPTIONS}
                selected={metadataType}
                onSelect={(value) =>
                  setMetadataType(value as EvaluationMetadataTypeTmp)
                }
              />
              <Text.H6M color='foregroundMuted'>
                {METADATA_TYPE_DESCRIPTIONS[metadataType]}
              </Text.H6M>
            </div>
          </FormField>
          <EvaluationV2Form
            mode='create'
            settings={settingsV2}
            setSettings={setSettingsV2}
            options={optionsV2}
            setOptions={setOptionsV2}
            errors={errorsV2}
            disabled={isCreating}
            forceTypeChange={
              /* TODO(evalsv2): Temporal hot garbage hack */
              metadataType === 'evaluationV2_llm'
                ? EvaluationType.Llm
                : EvaluationType.Rule
            }
          />
        </>
      ) : (
        <div className='w-full flex flex-col gap-4'>
          <FormField className='w-full'>
            <div className='flex flex-col gap-2'>
              <TabSelector
                fullWidth
                options={METADATA_TYPE_OPTIONS}
                selected={metadataType}
                onSelect={(value) =>
                  setMetadataType(value as EvaluationMetadataTypeTmp)
                }
              />
              <Text.H6M color='foregroundMuted'>
                {METADATA_TYPE_DESCRIPTIONS[metadataType]}
              </Text.H6M>
            </div>
          </FormField>
          <FormField label='Title'>
            <Input
              value={title}
              errors={titleError ? [titleError] : undefined}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='Enter title'
              className='w-full'
            />
          </FormField>
          <FormField label='Description'>
            <TextArea
              value={description}
              minRows={4}
              maxRows={6}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Describe what is the purpose of this evaluation'
              className='w-full'
            />
          </FormField>
          <FormField>
            <SelectableCard
              key={EvaluationResultableType.Number}
              title='Number'
              description='Allows numbers as results, ideal for quantitative data analysis like averages, totals, or other calculations'
              selected={configuration.type === EvaluationResultableType.Number}
              onClick={() => handleTypeChange(EvaluationResultableType.Number)}
            />
          </FormField>
          {configuration.type === EvaluationResultableType.Number && (
            <FormField label='Range'>
              <div className='flex flex-row items-center flex-1 gap-4'>
                <Input
                  type='number'
                  min={0}
                  value={configuration.detail?.range.from.toString() || 1}
                  placeholder='From'
                  onChange={handleRangeFromChange}
                />
                <Input
                  type='number'
                  min={0}
                  value={configuration.detail?.range.to.toString() || 5}
                  placeholder='To'
                  onChange={handleRangeToChange}
                />
              </div>
            </FormField>
          )}
          <FormField>
            <SelectableCard
              key={EvaluationResultableType.Boolean}
              title='Boolean'
              description='Only allows true or false results, ideal for categorization and binary data such as pass/fail, yes/no, or 0/1 values'
              selected={configuration.type === EvaluationResultableType.Boolean}
              onClick={() => handleTypeChange(EvaluationResultableType.Boolean)}
            />
          </FormField>
          <FormField>
            <SelectableCard
              key={EvaluationResultableType.Text}
              title='Text'
              description="It allows strings as results, making it ideal for any other evaluation that doesn't fit the other two types"
              selected={configuration.type === EvaluationResultableType.Text}
              onClick={() => handleTypeChange(EvaluationResultableType.Text)}
            />
          </FormField>
        </div>
      )}
    </ConfirmModal>
  )
}
