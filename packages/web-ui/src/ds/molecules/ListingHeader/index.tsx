import { ButtonHTMLAttributes, ReactNode } from 'react'

import { Button, Text } from '../../atoms'

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

const ListingHeader = ({
  title,
  actions,
}: {
  title: string
  actions?: ReactNode
}) => {
  return (
    <div className='flex flex-row justify-between items-center gap-4'>
      <Text.H4B>{title}</Text.H4B>
      {actions ? <div className='flex gap-1'>{actions}</div> : null}
    </div>
  )
}

ListingHeader.Button = ListingButton

export { ListingHeader }
