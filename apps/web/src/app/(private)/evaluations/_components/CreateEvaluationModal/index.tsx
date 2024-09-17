import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'

import {
  EvaluationResultableType,
  EvaluationResultConfiguration,
} from '@latitude-data/core/browser'
import {
  ConfirmModal,
  FormField,
  Input,
  ReactStateDispatch,
  TabSelector,
  TextArea,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import { useRouter } from 'next/navigation'

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
      router.push(ROUTES.evaluations.detail({ uuid: newEvaluation.uuid }).root)
      onClose(null)
    },
  })

  const onConfirm = useCallback(() => {
    create({
      name: title,
      description,
      metadata: { prompt },
      configuration,
    })
    onClose(null)
  }, [create, onClose, title, description, prompt, configuration])

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
        label: 'Create evaluation',
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
        <FormField label='Type'>
          <TabSelector
            options={[
              { label: 'Text', value: EvaluationResultableType.Text },
              { label: 'Number', value: EvaluationResultableType.Number },
              { label: 'Boolean', value: EvaluationResultableType.Boolean },
            ]}
            onSelect={handleTypeChange}
            selected={configuration.type}
          />
        </FormField>
        {configuration.type === EvaluationResultableType.Number && (
          <FormField label='Range'>
            <div className='flex flex-row items-center flex-1 gap-4'>
              <Input
                type='number'
                min={0}
                value={configuration.detail?.range.from.toString() || ''}
                placeholder='From'
                onChange={handleRangeFromChange}
              />
              <Input
                type='number'
                min={0}
                value={configuration.detail?.range.to.toString() || ''}
                placeholder='To'
                onChange={handleRangeToChange}
              />
            </div>
          </FormField>
        )}
      </div>
    </ConfirmModal>
  )
}

export function useEvaluationConfiguration(
  init?: EvaluationResultConfiguration,
) {
  const [configuration, setConfiguration] =
    useState<EvaluationResultConfiguration>(
      init || {
        type: EvaluationResultableType.Text,
      },
    )

  const handleTypeChange = useCallback((value: EvaluationResultableType) => {
    if (value === EvaluationResultableType.Number) {
      setConfiguration({
        type: value,
        detail: { range: { from: 0, to: 1 } },
      })
    } else {
      setConfiguration({ type: value })
    }
  }, [])

  const handleRangeFromChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setConfiguration((prev) => {
        const next = { ...prev }
        const value = e.target.value

        if (value === '') {
          next.detail = {
            range: { from: 0, to: next.detail?.range.to || 0 },
          }
          return next
        }

        const from = parseInt(value)
        if (next.detail?.range) {
          next.detail.range.from = from
          if (from > next.detail.range.to) {
            next.detail.range.to = from + 1
          }
        } else {
          next.detail = {
            range: { from, to: from + 1 },
          }
        }

        return next
      })
    },
    [],
  )

  const handleRangeToChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setConfiguration((prev) => {
        const next = { ...prev }
        const value = e.target.value

        if (value === '') {
          next.detail = {
            range: { from: 0, to: 0 },
          }
          return next
        }

        const to = parseInt(value)
        if (next.detail?.range) {
          next.detail.range.to = to
          if (to < next.detail.range.from) {
            next.detail.range.from = to - 1
          }
        } else {
          next.detail = {
            range: { from: to - 1, to },
          }
        }

        return next
      })
    },
    [],
  )

  useEffect(() => {
    if (!init) return

    setConfiguration(init)
  }, [init])

  return {
    configuration,
    handleTypeChange,
    handleRangeFromChange,
    handleRangeToChange,
  }
}
