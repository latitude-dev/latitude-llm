import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationResultConfiguration,
} from '@latitude-data/core/browser'
import {
  ConfirmModal,
  FormField,
  Input,
  ReactStateDispatch,
  SelectableCard,
  TabSelector,
  Text,
  TextArea,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import { useRouter } from 'next/navigation'

import { useEvaluationConfiguration } from './useEvaluationConfiguration'

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
  const [title, setTitle] = useState(initialData?.title ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [prompt, setPrompt] = useState(initialData?.prompt ?? '')
  const [metadataType, setMetadataType] = useState(
    EvaluationMetadataType.LlmAsJudgeSimple,
  )
  const {
    configuration,
    handleTypeChange,
    handleRangeFromChange,
    handleRangeToChange,
  } = useEvaluationConfiguration(initialData?.configuration)

  const router = useRouter()

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
    isCreating,
  } = useEvaluations({
    onSuccessCreate: (newEvaluation) => {
      if (newEvaluation.metadataType === EvaluationMetadataType.Manual) {
        router.push(
          ROUTES.evaluations.detail({ uuid: newEvaluation.uuid }).root,
        )
      } else {
        router.push(
          ROUTES.evaluations.detail({ uuid: newEvaluation.uuid }).editor.root,
        )
      }
      onClose(null)
    },
  })

  const onConfirm = useCallback(() => {
    const resultConfiguration =
      configuration.type === EvaluationResultableType.Number
        ? {
            type: configuration.type,
            minValue: configuration.detail!.range.from,
            maxValue: configuration.detail!.range.to,
          }
        : { type: configuration.type }

    if (prompt) {
      create({
        name: title,
        description,
        metadata: {
          type: EvaluationMetadataType.LlmAsJudgeAdvanced,
          prompt,
        },
        resultConfiguration,
      })
    } else if (metadataType === EvaluationMetadataType.LlmAsJudgeSimple) {
      create({
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
      create({
        name: title,
        description,
        resultConfiguration,
        metadata: {
          type: EvaluationMetadataType.Manual,
        },
      })
    }

    onClose(null)
  }, [create, onClose, title, description, prompt, configuration, metadataType])

  const titleError = useMemo<string | undefined>(() => {
    if (!title) return 'Please enter a name for your evaluation.'
    if (existingEvaluations?.find((e) => e.name === title))
      return 'There is already an evaluation with this name. Please choose a different name.'
    return undefined
  }, [existingEvaluations, title])

  return (
    <ConfirmModal
      open={!!initialData}
      title='Create New Evaluation'
      description='Evaluations allow you to analyze logs and assign them metrics such as scores, categories, or boolean values.'
      onOpenChange={() => onClose(null)}
      onConfirm={onConfirm}
      confirm={{
        label: isLoading ? 'Loading...' : 'Create evaluation',
        description:
          prompt &&
          'A prompt is included with this template. You can edit it once you create the evaluation.',
        disabled: isLoading || isCreating || !!titleError,
        isConfirming: isCreating,
      }}
    >
      <div className='w-full flex flex-col gap-4'>
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
        <FormField className='w-full'>
          <div className='flex flex-col gap-2'>
            <TabSelector
              fullWidth
              options={[
                {
                  label: 'LLM as judge',
                  value: EvaluationMetadataType.LlmAsJudgeSimple,
                },
                {
                  label: 'Code / Manual',
                  value: EvaluationMetadataType.Manual,
                },
              ]}
              selected={metadataType}
              onSelect={setMetadataType}
            />
            <Text.H6M color='foregroundMuted'>
              {metadataType === EvaluationMetadataType.LlmAsJudgeSimple
                ? 'Use AI to automatically evaluate your logs based on predefined criteria'
                : 'Use your own evaluation logic and push evaluation results to Latitude with our SDK or HTTP API'}
            </Text.H6M>
          </div>
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
                defaultValue={1}
                placeholder='From'
                onChange={handleRangeFromChange}
              />
              <Input
                type='number'
                min={0}
                value={configuration.detail?.range.to.toString() || 5}
                defaultValue={5}
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
    </ConfirmModal>
  )
}
