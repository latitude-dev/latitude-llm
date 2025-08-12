import { ReactNode } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'

export function TriggerWrapper({
  children,
  title,
  description,
}: {
  children: ReactNode
  title: string
  description: string
}) {
  return (
    <div className='h-full bg-background flex flex-col gap-4 p-4'>
      <div className='space-y-1'>
        <Text.H3 display='block'>{title}</Text.H3>
        <Text.H5 display='block' color='foregroundMuted'>
          {description}
        </Text.H5>
      </div>
      <FormWrapper>{children}</FormWrapper>
    </div>
  )
}
