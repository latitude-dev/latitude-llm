import { ButtonHTMLAttributes, ReactNode } from 'react'

import { Button, Text } from '../../atoms'

export function LinkButtonStyle({
  children,
  onClick,
}: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button onClick={onClick} fancy>
      {children}
    </Button>
  )
}

const TableBlankSlate = ({
  link,
  description,
}: {
  link: ReactNode
  description: string
}) => {
  return (
    <div className='rounded-lg w-full py-40 flex flex-col gap-4 items-center justify-center bg-gradient-to-b from-secondary to-transparent'>
      <div className='max-w-[50%]'>
        <Text.H5 align='center' display='block' color='foregroundMuted'>
          {description}
        </Text.H5>
      </div>
      {link}
    </div>
  )
}

TableBlankSlate.Button = LinkButtonStyle

export { TableBlankSlate }
