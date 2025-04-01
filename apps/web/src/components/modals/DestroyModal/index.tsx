import { AnimatedDots } from '@latitude-data/web-ui/molecules/AnimatedDots'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useFormAction } from '$/hooks/useFormAction'
import {
  inferServerActionError,
  inferServerActionInput,
  inferServerActionReturnData,
  TAnyZodSafeFunctionHandler,
} from 'zsa'

type Props<TServerAction extends TAnyZodSafeFunctionHandler> = {
  action: (
    data: inferServerActionInput<TServerAction>,
  ) => Promise<
    | [inferServerActionReturnData<TServerAction>, null]
    | [null, inferServerActionError<TServerAction>]
  >
  onSuccess?: (payload: inferServerActionReturnData<TServerAction>) => void
  onOpenChange?: (open: boolean) => void
  title: string
  description: string
  submitStr: string
  isDestroying?: boolean
  model: { id: string | number }
}
export default function DestroyModal<
  TServerAction extends TAnyZodSafeFunctionHandler,
>({
  action,
  isDestroying,
  onSuccess,
  onOpenChange,
  title,
  description,
  submitStr,
  model,
}: Props<TServerAction>) {
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
      dismissible
      open
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <form id='destroyProjectForm' action={actionFn}>
            <input type='hidden' name='id' value={model.id} />
          </form>
          <CloseTrigger />
          <Button
            fancy
            disabled={isDestroying}
            variant='destructive'
            form='destroyProjectForm'
            type='submit'
          >
            {isDestroying ? (
              <AnimatedDots color='destructiveForeground' />
            ) : (
              submitStr
            )}
          </Button>
        </>
      }
    />
  )
}
