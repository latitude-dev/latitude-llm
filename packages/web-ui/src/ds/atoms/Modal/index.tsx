'use client'

import { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Alert } from '../Alert'
import { Button } from '../Button'
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

export type ModalProps = {
  title?: string
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'regular' | 'large'
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
}: ModalProps) {
  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn({
          'max-w-modal': size === 'regular',
          'max-w-modal-lg': size === 'large',
        })}
      >
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
        )}

        {children}

        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
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
