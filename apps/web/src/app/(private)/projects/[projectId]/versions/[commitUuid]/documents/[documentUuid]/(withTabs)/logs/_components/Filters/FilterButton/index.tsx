import { ReactNode, useMemo, useState } from 'react'

import { Popover } from '@latitude-data/web-ui/atoms/Popover'

type AllowedColors = 'primary' | 'foregroundMuted' | 'destructive'

type AllowedDarkColors =
  | 'dark:text-foreground'
  | 'dark:text-foregroundMuted'
  | 'dark:text-destructive'
type FilterColor = {
  color: AllowedColors
  darkColor: AllowedDarkColors
}
export function useFilterButtonColor({
  isDefault,
  isSelected,
}: {
  isDefault: boolean
  isSelected: boolean
}) {
  return useMemo<FilterColor>(() => {
    if (isDefault) {
      return {
        color: 'foregroundMuted',
        darkColor: 'dark:text-foregroundMuted',
      }
    }
    if (isSelected) {
      return { color: 'primary', darkColor: 'dark:text-foreground' }
    }

    return { color: 'destructive', darkColor: 'dark:text-destructive' }
  }, [isDefault, isSelected])
}

export function FilterButton({
  label,
  color,
  darkColor,
  children,
}: {
  label: string
  color: AllowedColors
  darkColor?: AllowedDarkColors
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.ButtonTrigger color={color} overrideDarkColor={darkColor}>
        {label}
      </Popover.ButtonTrigger>
      <Popover.Content align='end' scrollable size='large'>
        {children}
      </Popover.Content>
    </Popover.Root>
  )
}
