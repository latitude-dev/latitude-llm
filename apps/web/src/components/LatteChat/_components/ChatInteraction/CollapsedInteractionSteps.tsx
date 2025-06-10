import { useState, useEffect } from 'react'
import { LatteInteractionStep } from '$/hooks/latte/types'
import { InteractionStep } from './InteractionStep'

const STEP_LINE_HEIGHT = 1.25 // rem

export const CollapsedInteractionSteps = ({
  steps,
  isLoading = false,
}: {
  steps: LatteInteractionStep[]
  isLoading?: boolean
}) => {
  const [currentLine, setCurrentLine] = useState(0)

  useEffect(() => {
    setCurrentLine(steps.length) // +1 for the initial thinking step
    console.log('current line =', steps.length)
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
          singleLine
        />{' '}
        {steps.map((step, index) => (
          <InteractionStep
            key={index}
            step={step}
            isLoading={isLoading && index === steps.length - 1}
            singleLine
          />
        ))}
      </div>
    </div>
  )
}
