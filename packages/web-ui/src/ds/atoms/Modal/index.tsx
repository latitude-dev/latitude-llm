'use client'

import { ReactNode } from 'react'

import { Alert } from '$ui/ds/atoms/Alert'
import { Button } from '$ui/ds/atoms/Button'

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
}
export function Modal({
  open,
  defaultOpen,
  onOpenChange,
  children,
  footer,
  title,
  description,
}: ModalProps) {
  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-modal'>
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
  type?: 'default' | 'primary' | 'destructive'
  confirm: {
    label: string
    title?: string
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
            isLoading={confirm.isConfirming}
            variant={type === 'primary' ? 'default' : type}
            onClick={onConfirm}
          >
            {confirm.label}
          </Button>
        </div>
      }
    >
      {confirm.description || confirm.title ? (
        <Alert
          variant={type}
          title={confirm.title}
          description={confirm.description}
        />
      ) : (
        children
      )}
    </Modal>
  )
}

export const CloseTrigger = ({
  children = <Button variant='outline'>Close</Button>,
}) => {
  return <DialogClose asChild>{children}</DialogClose>
}
