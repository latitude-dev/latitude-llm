import { ReactNode } from 'react'
import { AnimatedDots } from '@latitude-data/web-ui/molecules/AnimatedDots'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useFormAction } from '$/hooks/useFormAction'
import {
  LatitudeGenericActionFunc,
  LatitudeData,
  SuccessActionCallback,
} from '$/hooks/useLatitudeAction'

type Props<F extends LatitudeGenericActionFunc> = {
  action: F
  onSuccess?: SuccessActionCallback<LatitudeData<F>>
  onOpenChange?: (open: boolean) => void
  title: string
  description: string
  submitStr: string
  isDestroying?: boolean
  model: { id: string | number }
  disabled?: boolean
  children?: ReactNode
}
export default function DestroyModal<F extends LatitudeGenericActionFunc>({
  action,
  isDestroying,
  onSuccess,
  onOpenChange,
  title,
  description,
  submitStr,
  model,
  disabled,
  children,
}: Props<F>) {
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
            disabled={disabled || isDestroying}
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
    >
      {children}
    </Modal>
  )
}
