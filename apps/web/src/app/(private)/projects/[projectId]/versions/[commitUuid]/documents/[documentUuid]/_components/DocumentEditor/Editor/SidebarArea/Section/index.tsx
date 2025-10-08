import { ReactNode, useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon, IconProps } from '@latitude-data/web-ui/atoms/Icons'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { SectionItemLoader } from '../SectionItem'

export function SectionLoader({ items = 3 }: { items: number }) {
  const sectionItems = useMemo(() => Array.from({ length: items }), [items])
  return (
    <div className='flex flex-col gap-y-2'>
      <div className='flex justify-between gap-x-3'>
        <Skeleton height='h5' className='w-24' />

        <div className='flex flex-row gap-x-2'>
          <Icon name='plus' color='foregroundMuted' />
        </div>
      </div>
      {sectionItems.map((_, index) => (
        <SectionItemLoader key={index} />
      ))}
    </div>
  )
}

type SectionAction = {
  iconProps?: IconProps
  onClick: () => void
  disabled?: boolean
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
                disabled={action.disabled}
              />
            ))}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}
