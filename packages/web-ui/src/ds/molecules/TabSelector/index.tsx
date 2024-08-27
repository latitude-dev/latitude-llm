'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '../../../lib/utils'
import { Button, Text } from '../../atoms'

export type TabSelectorOption<T> = {
  label: string
  value: T
}

export function TabSelector<T>({
  options,
  selected: originalSelected,
  onSelect,
}: {
  options: TabSelectorOption<T>[]
  selected?: T
  onSelect?: (value: T) => void
}) {
  const selectedOptionButtonRef = useRef<HTMLButtonElement>(null)
  const selectedOptionBackgroundRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(originalSelected)
  useEffect(() => {
    setSelected(originalSelected)
  }, [originalSelected])

  const handleSelect = (value: T) => {
    setSelected(value)
    onSelect?.(value)
  }

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
    <div className='flex flex-row h-11 w-fit pb-1 bg-secondary rounded-xl border border-border'>
      <div className='flex flex-row relative bg-background rounded-xl border border-border -m-px p-1 gap-2'>
        <div
          className='absolute hidden bg-secondary rounded-lg border border-border -m-px p-1 gap-2 transition-all duration-200 ease-in-out'
          ref={selectedOptionBackgroundRef}
        />
        {options.map((option, idx) => {
          const isSelected = selected === option.value
          return (
            <Button
              ref={isSelected ? selectedOptionButtonRef : null}
              variant='ghost'
              size='none'
              key={idx}
              color={isSelected ? 'foreground' : 'foregroundMuted'}
              className={cn(
                'flex px-3 h-8 rounded-lg cursor-pointer items-center justify-center gap-1',
              )}
              onClick={() => handleSelect(option.value)}
            >
              <Text.H5M color={isSelected ? 'foreground' : 'foregroundMuted'}>
                {option.label}
              </Text.H5M>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
