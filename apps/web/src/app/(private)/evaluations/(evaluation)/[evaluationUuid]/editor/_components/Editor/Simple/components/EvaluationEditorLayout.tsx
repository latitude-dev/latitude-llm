import { FormEvent, ReactNode, useState } from 'react'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { ejectEvaluationAction } from '$/actions/evaluations/eject'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useRouter } from 'next/navigation'

interface EvaluationEditorLayoutProps {
  name: string
  formId: string
  evaluationId: number
  children: ReactNode
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>
}

export function EvaluationEditorLayout({
  name,
  formId,
  evaluationId,
  children,
  onSubmit,
}: EvaluationEditorLayoutProps) {
  const [showEjectModal, setShowEjectModal] = useState(false)
  const router = useRouter()
  const { execute: eject, isPending } = useLatitudeAction(
    ejectEvaluationAction,
    {
      onSuccess: () => {
        router.refresh()
      },
      onError: ({ err }) => {
        toast({
          title: 'Error',
          description: err.message,
          variant: 'destructive',
        })
      },
    },
  )
  const { toast } = useToast()

  const handleEject = () => eject({ id: evaluationId })

  return (
    <div className='flex flex-col gap-y-2 h-full'>
      <div className='flex flex-row items-center justify-between'>
        <Text.H4M>{name}</Text.H4M>
        <div className='flex gap-2'>
          <Button
            fancy
            variant='outline'
            onClick={() => setShowEjectModal(true)}
          >
            <div className='flex flex-row items-center gap-x-2'>
              Eject <Icon name='pencil' />
            </div>
          </Button>
          <Button fancy form={formId} type='submit'>
            Save changes
          </Button>
        </div>
      </div>
      <form
        className='bg-backgroundCode flex flex-grow flex-col gap-y-4 p-4 rounded-lg border'
        id={formId}
        onSubmit={onSubmit}
      >
        {children}
      </form>

      <ConfirmModal
        open={showEjectModal}
        onOpenChange={setShowEjectModal}
        title='Eject to Advanced Mode'
        description='This action will convert this evaluation into an advanced evaluation with a custom prompt that you can further edit.'
        confirm={{
          label: 'Eject',
          isConfirming: isPending,
          description:
            'The evaluation will be converted to advanced mode with a custom prompt. This action cannot be undone.',
        }}
        onConfirm={handleEject}
      />
    </div>
  )
}
