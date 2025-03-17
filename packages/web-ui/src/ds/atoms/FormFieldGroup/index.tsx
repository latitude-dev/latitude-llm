import { ReactNode, useId } from 'react'

import { cn } from '../../../lib/utils'
import { FormDescription } from '../FormField'
import { Icon } from '../Icons'
import { Label } from '../Label'
import { Tooltip } from '../Tooltip'

export function FormFieldGroup({
  layout = 'horizontal',
  children,
  label,
  description,
  tooltip,
}: {
  children: ReactNode
  label?: string
  description?: string
  tooltip?: string
  layout?: 'horizontal' | 'vertical'
}) {
  const id = useId()
  return (
    <div className='space-y-2 w-full'>
      {label ? (
        <span className='flex flex-row items-center gap-2'>
          <Label variant='default' htmlFor={`form-field-group-label-${id}`}>
            {label}
          </Label>
          {tooltip && (
            <Tooltip
              asChild
              trigger={
                <span>
                  <Icon name='info' color='foregroundMuted' />
                </span>
              }
              maxWidth='max-w-[400px]'
              align='start'
              side='top'
            >
              {tooltip}
            </Tooltip>
          )}
        </span>
      ) : null}
      <div
        role='group'
        className={cn('flex', {
          'gap-x-2 items-start': layout === 'horizontal',
          'flex-col gap-y-2': layout === 'vertical',
        })}
        id={`form-field-group-${id}`}
        aria-labelledby={id}
        aria-describedby={description}
      >
        {children}
      </div>
      {description ? <FormDescription>{description}</FormDescription> : null}
    </div>
  )
}
