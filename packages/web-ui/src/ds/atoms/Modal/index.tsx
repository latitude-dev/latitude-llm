'use client'

import { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Alert } from '../Alert'
import { Button } from '../Button'
import Text from '../Text'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Primitives'

export const ModalTrigger = DialogTrigger

function StepSelector({ total, current }: { total: number; current: number }) {
  return (
    <div className='flex flex-row items-center w-full gap-2 pt-4 pr-6'>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-1 flex-grow rounded-full',
            i < current ? 'bg-primary' : 'bg-muted',
          )}
        />
      ))}
      <Text.H6M>{`${current}/${total}`}</Text.H6M>
    </div>
  )
}

export type ModalProps = {
  title?: string
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'regular' | 'large'
  steps?: {
    total: number
    current: number
  }
  dismissible?: boolean
}

export function Modal({
  open,
  defaultOpen,
  onOpenChange,
  children,
  footer,
  title,
  description,
  size = 'regular',
  steps,
  dismissible = false,
}: ModalProps) {
  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent
        dismissible={dismissible}
        className={cn('flex flex-col', {
          'max-w-modal': size === 'regular',
          'max-w-modal-lg': size === 'large',
        })}
      >
        <div className='flex flex-col gap-y-4 overflow-y-auto custom-scrollbar relative'>
          <div className='sticky top-0 flex flex-col gap-y-4'>
            {steps && (
              <StepSelector total={steps.total} current={steps.current} />
            )}

            {(title || description) && (
              <DialogHeader>
                {title && <DialogTitle>{title}</DialogTitle>}
                {description && (
                  <DialogDescription>{description}</DialogDescription>
                )}
              </DialogHeader>
            )}
          </div>

          {children}

          {footer ? (
            <div className='sticky bottom-0'>
              <DialogFooter>{footer}</DialogFooter>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ConfirmModalProps = Omit<ModalProps, 'footer' | 'children'> & {
  type?: 'default' | 'destructive'
  confirm: {
    label: string
    title?: string
    disabled?: boolean
    description?: string
    isConfirming?: boolean
  }
  cancel?: { label?: string }
  onConfirm: () => void
  onCancel?: () => void
  children?: ReactNode
}
export function ConfirmModal({
  type = 'default',
  confirm,
  cancel,
  onConfirm,
  onCancel,
  children,
  ...rest
}: ConfirmModalProps) {
  return (
    <Modal
      {...rest}
      footer={
        <div className='flex justify-end space-x-2'>
          <DialogClose asChild>
            <Button fancy variant='outline' onClick={onCancel}>
              {cancel?.label ?? 'Cancel'}
            </Button>
          </DialogClose>
          <Button
            fancy
            disabled={confirm.disabled}
            isLoading={confirm.isConfirming}
            variant={type === 'default' ? 'default' : type}
            onClick={onConfirm}
          >
            {confirm.label}
          </Button>
        </div>
      }
    >
      {children}
      {confirm.description || confirm.title ? (
        <Alert
          variant={type}
          title={confirm.title}
          description={confirm.description}
        />
      ) : null}
    </Modal>
  )
}

export const CloseTrigger = ({
  children = (
    <Button fancy variant='outline'>
      Close
    </Button>
  ),
}) => {
  return <DialogClose asChild>{children}</DialogClose>
}
