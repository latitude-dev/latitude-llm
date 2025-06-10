import { LatteInteraction } from '$/hooks/latte/types'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { AnimatedDots } from '@latitude-data/web-ui/molecules/AnimatedDots'
import { cn } from '@latitude-data/web-ui/utils'
import { useState } from 'react'
import { MarkdownResponse } from './MarkdownText'
import { InteractionStep } from './InteractionStep'
import { CollapsedInteractionSteps } from './CollapsedInteractionSteps'

export function ChatInteraction({
  interaction,
}: {
  interaction: LatteInteraction
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className='flex flex-col gap-4 w-full relative'>
      <div className='flex flex-col py-2 px-4 gap-2 bg-accent rounded-lg ml-auto'>
        <Text.H5 color='primary' whiteSpace='preWrap'>
          {interaction.input}
        </Text.H5>
      </div>

      {interaction.steps.length > 0 || !interaction.output ? (
        <div
          className='flex flex-row gap-2 hover:opacity-80 cursor-pointer px-2'
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <Icon
            name='chevronRight'
            color='foregroundMuted'
            className={cn('transition-all min-w-4', {
              'rotate-90': isOpen,
            })}
          />
          <div className='flex flex-col gap-4 flex-grow max-w-full px-2'>
            {isOpen && interaction.steps.length > 0 ? (
              interaction.steps.map((step, i) => (
                <InteractionStep
                  key={i}
                  step={step}
                  isLoading={
                    interaction.output === undefined &&
                    i === interaction.steps.length - 1
                  }
                />
              ))
            ) : (
              <CollapsedInteractionSteps
                steps={interaction.steps}
                isLoading={interaction.output === undefined}
              />
            )}
          </div>
        </div>
      ) : null}

      {interaction.output ? (
        <MarkdownResponse text={interaction.output} />
      ) : (
        <AnimatedDots color='foregroundMuted' />
      )}
    </div>
  )
}
