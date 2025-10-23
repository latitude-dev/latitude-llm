'use client'
import { useTheme } from 'next-themes'
import { useCallback, useMemo } from 'react'
import { Button } from '../../atoms/Button'
import { ClientOnly } from '../../atoms/ClientOnly'
import { cn } from '../../../lib/utils'
import {
  AppLocalStorage,
  useLocalStorage,
} from '../../../lib/hooks/useLocalStorage'
import { IconName } from '../../atoms/Icons'

export const THEMES = ['light', 'dark', 'pink', 'system'] as const
export type ThemeValue = (typeof THEMES)[number]

const THEME_ICON: Record<ThemeValue, IconName> = {
  light: 'sun',
  dark: 'moon',
  pink: 'heart',
  system: 'monitor',
}

export function TripleThemeToggle({
  direction = 'horizontal',
  pinkThemeAvailable = false,
}: {
  direction?: 'horizontal' | 'vertical'
  pinkThemeAvailable?: boolean
}) {
  const { theme: initialTheme, setTheme } = useTheme()
  const { value: theme, setValue: setLocalTheme } = useLocalStorage<ThemeValue>(
    {
      key: AppLocalStorage.colorTheme,
      defaultValue: initialTheme as ThemeValue,
    },
  )
  const AVAILABLE_THEMES = useMemo(() => {
    if (pinkThemeAvailable) return THEMES
    return THEMES.filter((t) => t !== 'pink')
  }, [pinkThemeAvailable])

  const onClick = useCallback(
    (t: ThemeValue) => () => {
      setLocalTheme(t)
      setTimeout(() => {
        setTheme(() => t)
      }, 200) // Css transition duration
    },
    [setTheme, setLocalTheme],
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
          {AVAILABLE_THEMES.map((t) => (
            <Button
              key={t}
              variant='nope'
              size='icon'
              onClick={onClick(t)}
              aria-label={`Switch to ${t} theme`}
              className='rounded-full relative z-10'
              iconProps={{
                name: THEME_ICON[t],
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
