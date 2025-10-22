'use client'

import { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { zIndex as globalZIndex, ZIndex } from '../../tokens/zIndex'
import { Alert } from '../Alert'
import { Button } from '../Button'
import { Text } from '../Text'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogContentProps,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  type FooterProps,
} from './Primitives'

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
  warningDescription?: string
  children?: ReactNode
  footer?: ReactNode
  size?: 'small' | 'regular' | 'medium' | 'large' | 'xl' | 'full'
  height?: DialogContentProps['height']
  steps?: {
    total: number
    current: number
  }
  dismissible?: boolean
  scrollable?: boolean
  zIndex?: ZIndex
  footerAlign?: FooterProps['align']
}

export function Modal({
  open,
  defaultOpen,
  onOpenChange,
  children,
  footer,
  title,
  description,
  warningDescription,
  size = 'regular',
  height = 'content',
  steps,
  dismissible = false,
  scrollable = true,
  zIndex = 'modal',
  footerAlign = 'right',
}: ModalProps) {
  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent
        dismissible={dismissible}
        height={height}
        className={cn('flex flex-col', globalZIndex[zIndex], {
          'max-w-modal-sm': size === 'small',
          'max-w-modal': size === 'regular',
          'max-w-modal-md': size === 'medium',
          'max-w-modal-lg': size === 'large',
          'max-w-modal-xl': size === 'xl',
          'max-w-[97.5%]': size === 'full',
        })}
      >
        <div className='flex flex-col relative h-full overflow-hidden'>
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
                    {warningDescription && (
                      <Alert
                        variant='warning'
                        description={warningDescription}
                        spacing='medium'
                      />
                    )}
                  </DialogHeader>
                </div>
              )}
            </div>
          ) : null}

          {children ? (
            <div
              className={cn('px-6', {
                'overflow-y-auto custom-scrollbar pb-6': scrollable,
                'min-h-0 flex-grow flex flex-col': !scrollable,
              })}
            >
              {children}
            </div>
          ) : null}

          {footer ? (
            <div
              className={cn('px-6 border-border border-t rounded-b-2xl', {
                'bg-background-gray py-4': !!footer,
              })}
            >
              {footer ? (
                <DialogFooter align={footerAlign}>{footer}</DialogFooter>
              ) : null}
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
  dismissible,
  scrollable,
  ...rest
}: ConfirmModalProps) {
  return (
    <Modal
      dismissible={dismissible}
      scrollable={scrollable}
      {...rest}
      footer={
        <div className='flex justify-end space-x-2'>
          {dismissible || onCancel ? (
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
      <div
        className={cn('flex flex-col gap-y-4', { 'pb-6 h-full': !scrollable })}
      >
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
