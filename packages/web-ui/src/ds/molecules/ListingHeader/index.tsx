import { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Button, ButtonProps } from '../../atoms/Button'
import { Text } from '../../atoms/Text'
import { TitleWithActions } from '../TitleWithActions'

export function ListingButton({
  variant = 'outline',
  fancy = true,
  children,
  ...rest
}: ButtonProps) {
  return (
    <Button variant={variant} fancy={fancy} {...rest}>
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
      <div className='flex flex-col gap-y-4'>
        <TitleWithActions title={title} actions={actions} />
        {description ? (
          <Text.H5 color='foregroundMuted'>{description}</Text.H5>
        ) : null}
      </div>
      {table && (
        <div
          className={cn('flex', {
            'relative min-h-0 min-w-0': takeVertialSpace,
          })}
        >
          {table}
        </div>
      )}
    </div>
  )
}

TableWithHeader.Button = ListingButton
