import { ButtonHTMLAttributes, ReactNode } from 'react'

import { Button } from '../../atoms'
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
  actions,
  table,
}: {
  title: string
  actions?: ReactNode
  table?: ReactNode
}) => {
  return (
    <div className='flex flex-col gap-4'>
      <TitleWithActions title={title} actions={actions} />
      <div>{table}</div>
    </div>
  )
}

TableWithHeader.Button = ListingButton
