import { LatteStepGroup } from '$/hooks/latte/types'
import { useEffect, useState } from 'react'
import { InteractionStep } from './InteractionStep'

const STEP_LINE_HEIGHT = 1.25 // rem

export const CollapsedInteractionSteps = ({
  steps,
  isLoading = false,
  isStreaming = false,
}: {
  steps: LatteStepGroup['steps'][number][]
  isLoading?: boolean
  isStreaming?: boolean
}) => {
  const [currentLine, setCurrentLine] = useState(steps.length)

  useEffect(() => {
    setCurrentLine(steps.length) // +1 for the initial thinking step
  }, [steps.length])

  return (
    <div className='w-full relative overflow-hidden h-6 leading-6'>
      <div
        className='absolute inset-x-0 transition-transform duration-500 ease-in-out flex flex-col justify-center'
        style={{
          transform: `translateY(-${currentLine * STEP_LINE_HEIGHT}rem)`,
        }}
      >
        {/* Thinking step*/}
        <InteractionStep
          key={-1}
          step={undefined}
          isLoading={isLoading}
          isStreaming={isStreaming}
          singleLine
        />{' '}
        {steps.map((step, index) => (
          <InteractionStep
            key={index}
            step={step}
            isLoading={isLoading && index === steps.length - 1}
            isStreaming={isStreaming}
            singleLine
          />
        ))}
      </div>
    </div>
  )
}
