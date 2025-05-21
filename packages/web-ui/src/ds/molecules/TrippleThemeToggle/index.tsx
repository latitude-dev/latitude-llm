'use client'
import { useTheme } from 'next-themes'
import { useCallback } from 'react'
import { Button } from '../../atoms/Button'
import { ClientOnly } from '../../atoms/ClientOnly'
import { cn } from '../../../lib/utils'
import {
  AppLocalStorage,
  useLocalStorage,
} from '../../../lib/hooks/useLocalStorage'

export const THEMES = ['light', 'dark', 'system'] as const
export type ThemeValue = (typeof THEMES)[number]

export function TripleThemeToggle({
  direction = 'horizontal',
}: {
  direction?: 'horizontal' | 'vertical'
}) {
  const { theme: initialTheme, setTheme } = useTheme()
  const { value: theme, setValue: setLocalTheme } = useLocalStorage<ThemeValue>(
    {
      key: AppLocalStorage.colorTheme,
      defaultValue: initialTheme as ThemeValue,
    },
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
      <div
        className={cn(
          'p-1 bg-gray-100 dark:bg-background-gray rounded-full flex items-center',
          { 'flex-col': direction === 'vertical' },
        )}
      >
        <div
          className={cn('relative flex', {
            'flex-col': direction === 'vertical',
          })}
        >
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
              'absolute top-0 left-0',
              'bg-background dark:bg-foreground/70 rounded-full',
              'transition-transform duration-200 ease-in-out',
              {
                'w-6 h-full': direction === 'horizontal',
                'h-6 w-full': direction === 'vertical',

                'translate-x-0':
                  theme === 'light' && direction === 'horizontal',
                'translate-x-6': theme === 'dark' && direction === 'horizontal',
                'translate-x-12':
                  theme === 'system' && direction === 'horizontal',

                'translate-y-0': theme === 'light' && direction === 'vertical',
                'translate-y-6': theme === 'dark' && direction === 'vertical',
                'translate-y-12':
                  theme === 'system' && direction === 'vertical',
              },
            )}
          />
        </div>
      </div>
    </ClientOnly>
  )
}
