import { useState, useEffect } from 'react'
import { LatteInteractionStep } from '$/hooks/latte/types'
import { InteractionStep } from './InteractionStep'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'

const STEP_LINE_HEIGHT = 1.25 // rem

export const CollapsedInteractionSteps = ({
  steps,
  isLoading = false,
  lastInteraction,
  isOpen,
  showThinking,
}: {
  steps: LatteInteractionStep[]
  isLoading?: boolean
  lastInteraction: boolean
  isOpen: boolean
  showThinking: boolean
}) => {
  const [currentLine, setCurrentLine] = useState(steps.length)

  useEffect(() => {
    setCurrentLine(steps.length) // +1 for the initial thinking step
  }, [steps.length])

  return (
    <>
      {(lastInteraction || steps.length > 0) && (
        <Icon
          name='chevronRight'
          color='latteOutputForegroundMuted'
          className={cn('transition-all min-w-4 mt-0.5', {
            'rotate-90': isOpen,
          })}
        />
      )}
      <div className='flex flex-col gap-4 flex-grow max-w-[75%]'>
        <div className='w-full relative overflow-hidden h-6 leading-6'>
          <div
            className='absolute inset-x-0 transition-transform duration-500 ease-in-out flex flex-col justify-center'
            style={{
              transform: `translateY(-${currentLine * STEP_LINE_HEIGHT}rem)`,
            }}
          >
            {/* Thinking step*/}
            {(lastInteraction || steps.length > 0) && (
              <InteractionStep
                key={-1}
                step={undefined}
                isLoading={isLoading && showThinking}
                singleLine
              />
            )}{' '}
            {steps.map((step, index) => (
              <InteractionStep
                key={index}
                step={step}
                isLoading={
                  isLoading &&
                  index === steps.length - 1 &&
                  !showThinking &&
                  lastInteraction
                }
                singleLine
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
