import { Button, CloseTrigger, Modal, useToast } from '@latitude-data/web-ui'
import { useFormAction } from '$/hooks/useFormAction'
import {
  inferServerActionError,
  inferServerActionInput,
  inferServerActionReturnData,
  TAnyZodSafeFunctionHandler,
} from 'zsa'

export default function DestroyModal({
  action,
  onSuccess,
  onOpenChange,
  title,
  description,
  submitStr,
  model,
}: {
  action: (
    data: inferServerActionInput<TAnyZodSafeFunctionHandler>,
  ) => Promise<
    | [inferServerActionReturnData<TAnyZodSafeFunctionHandler>, null]
    | [null, inferServerActionError<TAnyZodSafeFunctionHandler>]
  >
  onSuccess?: (payload: any) => void
  onOpenChange?: (open: boolean) => void
  title: string
  description: string
  submitStr: string
  model: { id: string | number }
}) {
  const { toast } = useToast()
  const { action: actionFn } = useFormAction(action, {
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
    onSuccess,
  })

  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            variant='destructive'
            form='destroyProjectForm'
            type='submit'
          >
            {submitStr}
          </Button>
        </>
      }
    >
      <form id='destroyProjectForm' action={actionFn}>
        <input type='hidden' name='id' value={model.id} />
      </form>
    </Modal>
  )
}
