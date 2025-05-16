import {
  CopilotChatInteraction,
  CopilotChatInteractionStep,
} from '$/stores/copilot/types'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { AnimatedDots } from '@latitude-data/web-ui/molecules/AnimatedDots'
import { cn } from '@latitude-data/web-ui/utils'
import { useState } from 'react'

export function LatteMessageList({
  interactions,
}: {
  interactions: CopilotChatInteraction[]
}) {
  return (
    <div className='flex flex-col gap-8 p-4 w-full'>
      {interactions.map((interaction, i) => {
        return <ChatInteraction key={i} interaction={interaction} />
      })}
    </div>
  )
}

function ChatInteraction({
  interaction,
}: {
  interaction: CopilotChatInteraction
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
          className='flex flex-row gap-2 hover:opacity-80 cursor-pointer'
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <Icon
            name='chevronRight'
            color='foregroundMuted'
            className={cn('transition-all min-w-4', {
              'rotate-90': isOpen,
            })}
          />
          <div className='flex flex-col gap-4 max-w-full'>
            <InteractionStep step={interaction.steps[0]} singleLine={!isOpen} />

            {isOpen
              ? interaction.steps
                  .slice(1)
                  .map((step, i) => <InteractionStep key={i} step={step} />)
              : interaction.steps
                  .filter((step) => typeof step !== 'string' && !step.finished)
                  .map((step, i) => (
                    <InteractionStep key={i} step={step} singleLine />
                  ))}
          </div>
        </div>
      ) : null}

      {interaction.output ? (
        <Text.H5 whiteSpace='preWrap'>{interaction.output}</Text.H5>
      ) : (
        <AnimatedDots color='foregroundMuted' />
      )}
    </div>
  )
}

function InteractionStep({
  step,
  singleLine,
}: {
  step?: CopilotChatInteractionStep
  singleLine?: boolean
}) {
  if (!step) {
    return (
      <Text.H5
        color='foregroundMuted'
        noWrap={singleLine}
        ellipsis={singleLine}
        animate
      >
        Thinking...
      </Text.H5>
    )
  }

  if (typeof step === 'string') {
    return (
      <Text.H5
        color='foregroundMuted'
        noWrap={singleLine}
        ellipsis={singleLine}
        whiteSpace='preWrap'
      >
        {step}
      </Text.H5>
    )
  }

  return (
    <div className='flex flex-row gap-2 items-center max-w-full'>
      <Icon
        name={step.finished ? 'check' : 'loader'}
        spin={!step.finished}
        color='foregroundMuted'
      />
      <Text.H5
        noWrap={singleLine}
        ellipsis={singleLine}
        color='foregroundMuted'
      >
        {step.finished
          ? (step.finishedDescription ?? step.description)
          : step.description}
      </Text.H5>
    </div>
  )
}
