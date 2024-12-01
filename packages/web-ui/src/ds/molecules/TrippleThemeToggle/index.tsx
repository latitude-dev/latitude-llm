'use client'

import { useTheme } from 'next-themes'
import { useCallback, useState } from 'react'
import { Button, ClientOnly } from '../../atoms'
import { cn } from '../../../lib/utils'

export const THEMES = ['light', 'dark', 'system'] as const
export type ThemeValue = (typeof THEMES)[number]

export function TripleThemeToggle() {
  const { theme: initialTheme, setTheme } = useTheme()
  const [theme, setLocalTheme] = useState<ThemeValue>(
    initialTheme as unknown as ThemeValue,
  )
  const onClick = useCallback(
    (t: ThemeValue) => () => {
      setLocalTheme(t)
      setTimeout(() => {
        setTheme(() => t)
      }, 200) // Css transition duration
    },
    [setTheme],
  )
  return (
    <ClientOnly>
      <div className='p-1 bg-gray-100 dark:bg-background-gray rounded-full flex items-center'>
        <div className='relative flex'>
          {THEMES.map((t) => (
            <Button
              key={t}
              variant='nope'
              size='icon'
              onClick={onClick(t)}
              aria-label={`Switch to ${t} theme`}
              className='rounded-full relative z-10'
              iconProps={{
                name: t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'monitor',
                color: 'foreground',
                darkColor: theme === t ? 'background' : 'foregroundMuted',
              }}
            />
          ))}
          <div
            className={cn(
              'absolute top-0 left-0 w-6 h-full',
              'bg-background dark:bg-foreground/70 rounded-full',
              'transition-transform duration-200 ease-in-out',
              {
                'translate-x-0': theme === 'light',
                'translate-x-6': theme === 'dark',
                'translate-x-12': theme === 'system',
              },
            )}
          />
        </div>
      </div>
    </ClientOnly>
  )
}
