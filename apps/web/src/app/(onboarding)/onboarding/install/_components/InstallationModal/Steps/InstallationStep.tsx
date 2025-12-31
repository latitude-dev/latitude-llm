import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactNode } from 'react'

export function InstallationStep({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className='flex flex-col gap-2'>
      <Text.H4M>{title}</Text.H4M>
      {description && <Text.H5>{description}</Text.H5>}
      {children}
    </div>
  )
}
