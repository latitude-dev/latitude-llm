import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  ConfirmModal,
  Input,
  ReactStateDispatch,
  Text,
  TextArea,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import { useRouter } from 'next/navigation'

export type CreateEvaluationData = {
  title: string
  description: string
  prompt: string
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
    })
    onClose(null)
  }, [create, onClose, title, description, prompt])

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
        <div className='w-full flex flex-col gap-4'>
          <Text.H5M>Name</Text.H5M>
          <Input
            value={title}
            errors={titleError ? [titleError] : undefined}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='Enter title'
            className='w-full'
          />
        </div>
        <div className='w-full flex flex-col gap-4'>
          <Text.H5M>Description</Text.H5M>
          <TextArea
            value={description}
            minRows={4}
            maxRows={6}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='Describe what is the purpose of this evaluation'
            className='w-full'
          />
        </div>
      </div>
    </ConfirmModal>
  )
}
