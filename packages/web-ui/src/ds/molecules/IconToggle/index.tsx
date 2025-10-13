'use client'

import { MouseEvent, useCallback } from 'react'
import { cn } from '../../../lib/utils'
import { Icon, IconName } from '../../atoms/Icons'

export function IconToggle({
  enabled,
  setEnabled,
  enabledIcon,
  disabledIcon,
}: {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  enabledIcon: IconName
  disabledIcon: IconName
}) {
  const onClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      e.preventDefault()
      e.nativeEvent.stopImmediatePropagation()

      setEnabled(!enabled)
    },
    [enabled, setEnabled],
  )

  return (
    <div
      className='p-1 bg-gray-100 dark:bg-background-gray rounded-full flex items-center cursor-pointer'
      onClick={onClick}
    >
      <div className='relative flex justify-center items-center'>
        <div className='rounded-full relative z-10 p-1'>
          <Icon
            name={disabledIcon}
            color='foreground'
            darkColor={!enabled ? 'background' : 'foregroundMuted'}
          />
        </div>
        <div className='rounded-full relative z-10 p-1'>
          <Icon
            name={enabledIcon}
            color='foreground'
            darkColor={enabled ? 'background' : 'foregroundMuted'}
          />
        </div>
        <div
          className={cn(
            'absolute top-0 left-0 w-6 h-full',
            'bg-background dark:bg-foreground/70 rounded-full',
            'transition-transform duration-200 ease-in-out',
            {
              'translate-x-0': !enabled,
              'translate-x-6': enabled,
            },
          )}
        />
      </div>
    </div>
  )
}
