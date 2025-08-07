import { Icon, type IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import type { ReactNode } from 'react'

export function ConfigSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-2'>
      <Text.H4B>{title}</Text.H4B>
      <div className='w-full px-2 flex flex-col gap-2'>{children}</div>
    </div>
  )
}

export function ConfigElement({
  label,
  icon,
  summary,
  description,
  descriptionCanOverflowInput,
  children,
}: {
  label: string
  icon?: IconName
  summary?: string
  description?: string
  descriptionCanOverflowInput?: boolean
  children: ReactNode
}) {
  return (
    <div className='flex flex-row gap-2'>
      <div className='min-w-4 pt-0.5'>{icon && <Icon name={icon} color='foregroundMuted' />}</div>
      <div className='flex flex-col gap-1 w-full'>
        <div className='flex flex-row items-center gap-2'>
          <div className='flex flex-row gap-2 items-center w-full'>
            <Text.H5>{label}</Text.H5>
            {description && (
              <Tooltip
                trigger={<Icon name='info' color='foregroundMuted' />}
                maxWidth='max-w-[400px]'
                align='start'
                side='top'
              >
                <div className='flex flex-col gap-2'>
                  {description.split('\n').map((line, index) => (
                    <Text.H6 key={index} color='background'>
                      {line}
                    </Text.H6>
                  ))}
                </div>
              </Tooltip>
            )}
          </div>
          {descriptionCanOverflowInput && <div className='w-fit'>{children}</div>}
        </div>
        {summary && <Text.H6 color='foregroundMuted'>{summary}</Text.H6>}
      </div>
      {!descriptionCanOverflowInput && (
        <div className='w-fit flex items-center ml-2'>{children}</div>
      )}
    </div>
  )
}
