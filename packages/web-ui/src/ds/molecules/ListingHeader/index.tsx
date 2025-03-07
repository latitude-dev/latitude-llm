import { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Button, Text } from '../../atoms'
import { TitleWithActions } from '../TitleWithActions'

export function ListingButton({
  children,
  onClick,
}: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button onClick={onClick} fancy variant='outline'>
      {children}
    </Button>
  )
}

export const TableWithHeader = ({
  title,
  description,
  actions,
  table,
  takeVertialSpace,
}: {
  title: string | ReactNode
  description?: string | ReactNode
  actions?: ReactNode
  table?: ReactNode
  takeVertialSpace?: boolean
}) => {
  return (
    <div
      className={cn('flex flex-col gap-4', {
        'flex-grow min-h-0': takeVertialSpace,
      })}
    >
      <div>
        <TitleWithActions title={title} actions={actions} />
        {description ? (
          <Text.H5 color='foregroundMuted'>{description}</Text.H5>
        ) : null}
      </div>
      <div
        className={cn('flex', {
          'flex-grow min-h-0 min-w-0': takeVertialSpace,
        })}
      >
        {table}
      </div>
    </div>
  )
}

TableWithHeader.Button = ListingButton
