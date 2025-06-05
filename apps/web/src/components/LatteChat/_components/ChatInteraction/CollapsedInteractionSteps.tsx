import { useState, useEffect, useRef } from 'react'
import { LatteInteractionStep } from '$/hooks/latte/types'
import { InteractionStep } from './InteractionStep'
import { cn } from '@latitude-data/web-ui/utils'

export const CollapsedInteractionSteps = ({
  steps,
}: {
  steps: LatteInteractionStep[]
}) => {
  const [displayedItem, setDisplayedItem] = useState<'last' | 'previous'>(
    'last',
  )
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (steps.length === 0) return

    setDisplayedItem('previous')
    setTimeout(() => {
      setDisplayedItem('last')
    }, 1) // Delay to allow the transition to take effect
  }, [steps.length])

  return (
    <div className='w-full relative overflow-hidden h-6 leading-6'>
      <div
        className={cn('absolute inset-x-0 top-0 transform', {
          'transition-transform duration-500 ease-in-out':
            displayedItem === 'last',

          '-translate-y-full': displayedItem === 'last',
          'translate-y-0': displayedItem === 'previous',
        })}
      >
        <InteractionStep
          key={steps.length - 2}
          step={steps[steps.length - 2]}
          singleLine
        />
      </div>

      <div
        className={cn('absolute inset-x-0 top-0 transform', {
          'transition-transform duration-500 ease-in-out':
            displayedItem === 'last',

          'translate-y-0': displayedItem === 'last',
          'translate-y-full': displayedItem === 'previous',
        })}
      >
        <InteractionStep
          key={steps.length - 1}
          step={steps[steps.length - 1]}
          singleLine
        />
      </div>
    </div>
  )
}
