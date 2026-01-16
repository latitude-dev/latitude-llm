import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { cn } from '@latitude-data/web-ui/utils'
import { PlanOption } from '../../_lib/buildPlanOptions'

function PlanCard({ option }: { option: PlanOption }) {
  const isPrimaryButton = option.recommended && !option.isCurrentPlan
  const isDisabled = option.isCurrentPlan || !option.actionUrl

  const button = (
    <Button
      fancy
      variant={isPrimaryButton ? 'default' : 'outline'}
      fullWidth
      disabled={isDisabled}
    >
      {option.actionLabel}
    </Button>
  )

  return (
    <div
      className={cn(
        'flex flex-col gap-4 p-6 rounded-xl border-2 text-left w-full',
        option.legacy
          ? 'border-border bg-muted opacity-75'
          : option.recommended
            ? 'border-primary bg-primary/5'
            : 'border-border',
      )}
    >
      <div className='flex items-start justify-between'>
        <div className='flex flex-col gap-1'>
          <div className='flex items-center gap-2'>
            <Text.H3B color={option.legacy ? 'foregroundMuted' : 'foreground'}>
              {option.name}
            </Text.H3B>
            {option.badge && <Badge variant='accent'>{option.badge}</Badge>}
          </div>
          <Text.H5 color='foregroundMuted'>{option.description}</Text.H5>
        </div>
      </div>

      <div className='flex items-baseline gap-1'>
        <Text.H2B color={option.legacy ? 'foregroundMuted' : 'foreground'}>
          {option.price}
        </Text.H2B>
        {option.priceDescription && (
          <Text.H5 color='foregroundMuted'>{option.priceDescription}</Text.H5>
        )}
      </div>

      <ul className='flex flex-col gap-2'>
        {option.features.map((feature) => (
          <li key={feature.text} className='flex items-start gap-2'>
            <div className='flex-shrink-0 pt-0.5'>
              <Icon
                name={feature.icon}
                color={option.legacy ? 'foregroundMuted' : feature.iconColor}
              />
            </div>
            <Text.H5 color={option.legacy ? 'foregroundMuted' : 'foreground'}>
              {feature.text}
            </Text.H5>
          </li>
        ))}
      </ul>

      <div className='mt-auto pt-2'>
        {option.actionUrl && !isDisabled ? (
          <a href={option.actionUrl} target='_blank' rel='noreferrer'>
            {button}
          </a>
        ) : (
          button
        )}
      </div>
    </div>
  )
}

export function PlanSelection({ planOptions }: { planOptions: PlanOption[] }) {
  const count = planOptions.length

  return (
    <div
      className={cn('flex flex-col items-center gap-8', {
        'max-w-3xl': count === 2,
        'max-w-5xl': count === 3,
        'max-w-7xl': count === 4,
      })}
    >
      <div className='flex flex-col items-center gap-4 text-center'>
        <div className='relative'>
          <Icon name='logo' size='xxxlarge' />
        </div>
        <Text.H1B color='foreground' centered>
          Choose your plan
        </Text.H1B>
        <Text.H4 color='foregroundMuted' centered>
          Select a plan to continue using Latitude after your trial ends.
        </Text.H4>
      </div>

      <div
        className={cn('grid grid-cols-1 gap-4 w-full', {
          'md:grid-cols-2': count === 2,
          'md:grid-cols-3': count === 3,
          'md:grid-cols-4': count === 4,
        })}
      >
        {planOptions.map((option) => (
          <PlanCard key={option.plan} option={option} />
        ))}
      </div>
    </div>
  )
}
