import { LatteInteraction } from '$/hooks/latte/types'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useEffect, useState } from 'react'
import { CollapsedInteractionSteps } from './CollapsedInteractionSteps'
import { InteractionStep } from './InteractionStep'
import { MarkdownResponse } from './MarkdownText'

export function ChatInteraction({
  interaction,
  isLoading,
  isStreaming,
}: {
  interaction: LatteInteraction
  isLoading?: boolean
  isStreaming?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  useEffect(() => {
    if (isStreaming) setIsOpen(true)
    else setIsOpen(false)
  }, [isStreaming])

  return (
    <div className='flex flex-col justify-center gap-4 w-full relative'>
      <div className='flex flex-col justify-center p-4 gap-2 bg-latte-input rounded-2xl ml-auto max-w-[75%]'>
        <Text.H5
          color='latteInputForeground'
          whiteSpace='preWrap'
          wordBreak='breakWord'
        >
          {interaction.input}
        </Text.H5>
      </div>

      {interaction.steps.length > 0 || (!interaction.output && isStreaming) ? (
        <div
          className='flex flex-row items-start gap-2 hover:opacity-80 cursor-pointer'
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <Icon
            name='chevronRight'
            color='latteOutputForegroundMuted'
            className={cn('transition-all min-w-4 mt-0.5', {
              'rotate-90': isOpen,
            })}
          />
          <div className='flex flex-col gap-4 flex-grow max-w-[75%]'>
            {isOpen && interaction.steps.length > 0 ? (
              interaction.steps.map((step, i) => (
                <InteractionStep
                  key={i}
                  step={step}
                  isLoading={isLoading && i === interaction.steps.length - 1}
                  isStreaming={isStreaming}
                />
              ))
            ) : (
              <CollapsedInteractionSteps
                steps={interaction.steps}
                isLoading={isLoading}
                isStreaming={isStreaming}
              />
            )}
          </div>
        </div>
      ) : null}

      <div className='flex flex-col gap-4 flex-grow max-w-[75%]'>
        {interaction.output && <MarkdownResponse text={interaction.output} />}
      </div>
    </div>
  )
}
