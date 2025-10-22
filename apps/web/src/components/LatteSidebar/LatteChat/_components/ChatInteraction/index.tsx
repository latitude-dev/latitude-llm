import { Fragment, ReactNode, useEffect, useState } from 'react'
import { LatteInteraction, LatteStepGroup } from '$/hooks/latte/types'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { MarkdownResponse } from './MarkdownText'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'
import { CollapsedInteractionSteps } from './CollapsedInteractionSteps'
import { InteractionStep } from './InteractionStep'

function StepGroup({
  group,
  isLoading,
  isStreaming,
  isOpenLastGroup,
  showLoaderIcon = false,
}: {
  group: LatteStepGroup
  isLoading: boolean
  isStreaming: boolean
  isOpenLastGroup: boolean
  showLoaderIcon?: boolean
}) {
  const [isOpen, setIsOpen] = useState(isOpenLastGroup)
  useEffect(() => {
    if (isOpenLastGroup) setIsOpen(true)
  }, [isOpenLastGroup])
  return (
    <div
      className='flex flex-row items-start gap-2 hover:opacity-80 cursor-pointer'
      onClick={() => setIsOpen((prev) => !prev)}
    >
      <Icon
        spin={showLoaderIcon}
        name={showLoaderIcon ? 'loader' : 'chevronRight'}
        color='latteOutputForegroundMuted'
        className={cn('transition-all min-w-4 mt-1', {
          'rotate-90': isOpen,
        })}
      />
      <div className='flex flex-col gap-4 flex-grow'>
        {isOpen && group.steps.length > 0 ? (
          group.steps.map((step, i) => (
            <InteractionStep
              key={i}
              step={step}
              isLoading={isLoading && i === group.steps.length - 1}
              isStreaming={isStreaming}
            />
          ))
        ) : (
          <CollapsedInteractionSteps
            steps={group.steps}
            isLoading={isLoading}
            isStreaming={isStreaming}
          />
        )}
      </div>
    </div>
  )
}

function StepWrap({ children }: { children: ReactNode }) {
  return <li className='flex flex-col gap-4 flex-grow'>{children}</li>
}

/**
 * A step group with an empty group is in brewing state
 * We use this to render this in the UI while the websocket arrives
 * with the actual steps
 */
function BrewingStep({ isStreaming }: { isStreaming?: boolean }) {
  if (!isStreaming) return null

  return (
    <StepWrap>
      <StepGroup
        showLoaderIcon
        group={{ type: 'group', steps: [] }}
        isLoading
        isStreaming
        isOpenLastGroup={false}
      />
    </StepWrap>
  )
}

export function ChatInteraction({
  interaction,
  isLoading = false,
  isStreaming = false,
}: {
  interaction: LatteInteraction
  isLoading?: boolean
  isStreaming?: boolean
}) {
  const onlyFirstText =
    interaction.steps.length === 1 && interaction.steps[0]?.type === 'text'
  return (
    <div className='flex flex-col justify-center gap-4 w-full relative'>
      <div className='flex flex-col justify-center px-4 py-3 gap-2 bg-latte-input rounded-2xl ml-auto max-w-[75%]'>
        <Text.H4
          color='latteInputForeground'
          whiteSpace='preWrap'
          wordBreak='breakWord'
        >
          {interaction.input}
        </Text.H4>
      </div>

      <ul className='flex flex-col gap-4'>
        {interaction.steps.length > 0 ? (
          <>
            {interaction.steps.map((step, i) => {
              const isLastGroup =
                step.type === 'group' && i === interaction.steps.length - 1
              return (
                <Fragment key={i}>
                  <StepWrap key={i}>
                    {step.type === 'text' ? (
                      <MarkdownResponse text={step.text} />
                    ) : step.type === 'group' ? (
                      <StepGroup
                        group={step}
                        isStreaming={isLastGroup && isStreaming}
                        isLoading={isLastGroup && isLoading}
                        isOpenLastGroup={isLastGroup && isStreaming}
                      />
                    ) : null}
                  </StepWrap>
                  {onlyFirstText ? (
                    <BrewingStep isStreaming={isStreaming} />
                  ) : null}
                </Fragment>
              )
            })}
          </>
        ) : (
          <BrewingStep isStreaming={isStreaming} />
        )}
      </ul>
    </div>
  )
}
