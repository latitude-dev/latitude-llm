'use client'

import { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Alert } from '../Alert'
import { Button } from '../Button'
import { Text } from '../Text'
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
import { zIndex } from '../../tokens/zIndex'

export const ModalTrigger = DialogTrigger

function StepSelector({ total, current }: { total: number; current: number }) {
  return (
    <div className='flex flex-row items-center w-full gap-2'>
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
  children?: ReactNode
  footer?: ReactNode
  size?: 'small' | 'regular' | 'large' | 'xl' | 'full'
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
        className={cn('flex flex-col', zIndex.modal, {
          'max-w-modal-sm': size === 'small',
          'max-w-modal': size === 'regular',
          'max-w-modal-lg': size === 'large',
          'max-w-modal-xl': size === 'xl',
          'max-w-[97.5%]': size === 'full',
        })}
      >
        <div className='flex flex-col relative max-h-full overflow-hidden'>
          {steps || title || description ? (
            <div className='flex flex-col gap-y-4 pb-6'>
              {steps && (
                <div className='pl-6 pt-6 pr-12'>
                  <StepSelector total={steps.total} current={steps.current} />
                </div>
              )}

              {(title || description) && (
                <div className={cn('px-6', { 'pt-6': !steps })}>
                  <DialogHeader>
                    {title && <DialogTitle>{title}</DialogTitle>}
                    {description && (
                      <DialogDescription>{description}</DialogDescription>
                    )}
                  </DialogHeader>
                </div>
              )}
            </div>
          ) : null}

          {children ? (
            <div className='px-6 pb-6 overflow-y-auto custom-scrollbar'>
              {children}
            </div>
          ) : null}

          <div
            className={cn('px-6 border-border border-t rounded-b-lg', {
              'bg-background-gray py-6': !!footer,
            })}
          >
            {footer ? <DialogFooter>{footer}</DialogFooter> : null}
          </div>
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
  dismissible,
  ...rest
}: ConfirmModalProps) {
  return (
    <Modal
      dismissible={dismissible}
      {...rest}
      footer={
        <div className='flex justify-end space-x-2'>
          {dismissible && onCancel ? (
            <DialogClose asChild>
              <Button fancy variant='outline' onClick={onCancel}>
                {cancel?.label ?? 'Cancel'}
              </Button>
            </DialogClose>
          ) : null}
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
      <div className='flex flex-col gap-y-4'>
        {children}
        {confirm.description || confirm.title ? (
          <Alert
            variant={type}
            title={confirm.title}
            description={confirm.description}
          />
        ) : null}
      </div>
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
