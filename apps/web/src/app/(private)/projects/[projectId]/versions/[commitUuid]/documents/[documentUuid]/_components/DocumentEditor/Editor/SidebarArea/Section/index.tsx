import { ReactNode } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { IconProps } from '@latitude-data/web-ui/atoms/Icons'
import { Button } from '@latitude-data/web-ui/atoms/Button'

type SectionAction = {
  iconProps?: IconProps
  onClick: () => void
}
export function SidebarSection({
  children,
  title,
  actions,
}: {
  title: string
  children?: ReactNode
  actions?: SectionAction[]
}) {
  return (
    <div className='flex flex-col gap-y-2'>
      <div className='flex justify-between gap-x-3'>
        <Text.H5M>{title}</Text.H5M>
        {actions ? (
          <div className='flex flex-row gap-x-2'>
            {actions?.map((action, index) => (
              <Button
                key={index}
                variant='ghost'
                size='icon'
                onClick={action.onClick}
                iconProps={action.iconProps ?? { name: 'plus' }}
              />
            ))}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}
