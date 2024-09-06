import { ReactNode, useId } from 'react'

import { cn } from '../../../lib/utils'
import { FormDescription } from '../FormField'
import { Label } from '../Label'

export function FormFieldGroup({
  layout = 'horizontal',
  children,
  label,
  description,
}: {
  children: ReactNode
  label?: string
  description?: string
  layout?: 'horizontal' | 'vertical'
}) {
  const id = useId()
  return (
    <div className='space-y-2 w-full'>
      {label ? (
        <Label variant='default' htmlFor={`form-field-group-label-${id}`}>
          {label}
        </Label>
      ) : null}
      <div
        role='group'
        className={cn('flex', {
          'gap-x-2 items-start': layout === 'horizontal',
        })}
        id={`form-field-group-${id}`}
        aria-labelledby={id}
        aria-describedby={description}
      >
        {children}
      </div>
      {description ? (
        <FormDescription id={`form-field-group-description-${id}`}>
          {description}
        </FormDescription>
      ) : null}
    </div>
  )
}
