import { LatteInteraction } from '$/hooks/latte/types'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'
import { InteractionStep } from './InteractionStep'

export const UncollapsedInteractionSteps = ({
  interaction,
  isOpen,
  showThinking,
}: {
  interaction: LatteInteraction
  isLoading: boolean
  isOpen: boolean
  showThinking: boolean
}) => {
  return (
    <>
      <Icon
        name='chevronRight'
        color='latteOutputForegroundMuted'
        className={cn('transition-all min-w-4 mt-0.5', {
          'rotate-90': isOpen,
        })}
      />
      <div className='flex flex-col gap-4 flex-grow max-w-[75%]'>
        {interaction.steps.map((step, i) => (
          <InteractionStep
            key={i}
            step={step}
            isLoading={
              interaction.output === undefined &&
              i === interaction.steps.length - 1 &&
              !showThinking
            }
          />
        ))}
      </div>
    </>
  )
}
