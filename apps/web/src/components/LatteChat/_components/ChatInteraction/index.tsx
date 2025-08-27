import { LatteInteraction } from '$/hooks/latte/types'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useState } from 'react'
import { CollapsedInteractionSteps } from './CollapsedInteractionSteps'
import { MarkdownResponse } from './MarkdownText'
import { UncollapsedInteractionSteps } from './UnCollapsedInteractionSteps'

export function ChatInteraction({
  interaction,
  isBrewing,
  lastInteraction,
  showThinking,
}: {
  interaction: LatteInteraction
  isBrewing?: boolean
  lastInteraction: boolean
  showThinking: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className='flex flex-col justify-center gap-4 w-full relative'>
      <div className='flex flex-col justify-center p-4 gap-2 bg-latte-input rounded-2xl ml-auto max-w-[75%]'>
        <Text.H5 color='latteInputForeground' whiteSpace='preWrap'>
          {interaction.input}
        </Text.H5>
      </div>

      {interaction.steps.length > 0 || (!interaction.output && isBrewing) ? (
        <div
          className='flex flex-row items-start gap-2 hover:opacity-80 cursor-pointer'
          onClick={() => setIsOpen((prev) => !prev)}
        >
          {isOpen && interaction.steps.length > 0 ? (
            <UncollapsedInteractionSteps
              interaction={interaction}
              isLoading={interaction.output === undefined}
              isOpen={isOpen}
              showThinking={showThinking}
            />
          ) : (
            <CollapsedInteractionSteps
              steps={interaction.steps}
              isLoading={interaction.output === undefined}
              lastInteraction={lastInteraction}
              isOpen={isOpen}
              showThinking={showThinking}
            />
          )}
        </div>
      ) : null}

      <div className='flex flex-col gap-4 flex-grow max-w-[75%]'>
        {interaction.output && <MarkdownResponse text={interaction.output} />}
      </div>
    </div>
  )
}
