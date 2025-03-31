'use client'
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '../../../lib/utils'
import { Button } from '../../atoms/Button'
import { Text } from '../../atoms/Text'

export type TabSelectorOption<T> = {
  label: ReactNode | string
  value: T
  route?: string
  disabled?: boolean
}

export function TabSelector<T extends string>({
  options,
  selected: originalSelected,
  showSelectedOnSubroutes = false,
  fullWidth = false,
  onSelect,
}: {
  options: TabSelectorOption<T>[]
  selected?: T | null
  onSelect?: (value: T) => void
  showSelectedOnSubroutes?: boolean
  fullWidth?: boolean
}) {
  const selectedOptionButtonRef = useRef<HTMLButtonElement>(null)
  const selectedOptionBackgroundRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(originalSelected)

  useEffect(() => {
    setSelected(originalSelected)
  }, [originalSelected])

  const handleSelect = useCallback(
    (option: TabSelectorOption<T>) => () => {
      if (option.disabled) return

      setSelected(option.value)
      onSelect?.(option.value)
    },
    [onSelect],
  )

  useEffect(() => {
    if (!selectedOptionBackgroundRef.current) return

    const background = selectedOptionBackgroundRef.current

    if (!selectedOptionButtonRef.current) {
      background.style.display = 'none'
      return
    }

    const button = selectedOptionButtonRef.current

    const updateBackgroundPosition = () => {
      background.style.top = `${button.offsetTop}px`
      background.style.left = `${button.offsetLeft}px`
      background.style.width = `${button.offsetWidth}px`
      background.style.height = `${button.offsetHeight}px`
      background.style.display = 'block'
    }

    updateBackgroundPosition()

    const resizeObserver = new ResizeObserver(updateBackgroundPosition)
    resizeObserver.observe(button)

    return () => resizeObserver.disconnect()
  }, [selected])

  return (
    <div
      className={cn(
        'flex flex-row h-11 pb-1 bg-secondary rounded-xl border border-border',
        fullWidth ? 'w-full' : 'w-fit',
      )}
    >
      <div
        className={cn(
          'flex flex-row justify-between gap-2 ',
          'bg-background rounded-xl border border-border',
          'relative -m-px p-1',
          {
            'w-[calc(100%+2px)]': fullWidth,
          },
        )}
      >
        <div
          className='absolute hidden bg-secondary rounded-lg border border-border -m-px p-1 gap-2 transition-all duration-200 ease-in-out'
          ref={selectedOptionBackgroundRef}
        />
        {options.map((option, idx) => {
          const isSelected = showSelectedOnSubroutes
            ? selected && option.value.startsWith(selected)
            : selected === option.value
          return (
            <div key={idx} className={cn('flex', fullWidth && 'flex-1')}>
              <Button
                ref={isSelected ? selectedOptionButtonRef : null}
                type='button'
                variant='ghost'
                size='none'
                color={isSelected ? 'foreground' : 'foregroundMuted'}
                className={cn(
                  'flex w-full px-3 h-8 rounded-lg cursor-pointer items-center justify-center gap-1',
                )}
                onClick={handleSelect(option)}
                fullWidth={fullWidth}
              >
                {typeof option.label === 'string' ? (
                  <Text.H5M
                    color={isSelected ? 'foreground' : 'foregroundMuted'}
                  >
                    {option.label}
                  </Text.H5M>
                ) : (
                  option.label
                )}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
