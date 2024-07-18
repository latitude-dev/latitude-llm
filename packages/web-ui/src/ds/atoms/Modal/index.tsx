'use client'

import { ReactNode } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Primitives'

export const ModalTrigger = DialogTrigger

export function Modal({
  children,
  footer,
  title,
  description,
}: {
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <Dialog>
      <DialogContent className='sm:max-w-modal'>
        {title || description ? (
          <DialogHeader>
            {title ? <DialogTitle>{title}</DialogTitle> : null}
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
        ) : null}

        <div className='py-4'>{children}</div>

        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}
