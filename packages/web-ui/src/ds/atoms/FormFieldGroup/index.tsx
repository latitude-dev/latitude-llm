import { ReactNode, useId } from 'react'
import { cn } from '../../../lib/utils'
import { DescriptionAndError } from '../FormField'
import { Icon } from '../Icons'
import { Label } from '../Label'
import { Tooltip } from '../Tooltip'

export function FormFieldGroup({
  layout = 'horizontal',
  children,
  label,
  description,
  descriptionPosition = 'bottom',
  tooltip,
  group = false,
  errors,
  centered = false,
}: {
  children: ReactNode
  name?: string
  label?: string | ReactNode
  description?: string
  descriptionPosition?: 'top' | 'bottom'
  tooltip?: string | ReactNode
  layout?: 'horizontal' | 'vertical'
  group?: boolean
  errors?: string[] | null | undefined
  centered?: boolean
}) {
  const error = errors?.[0]
  const id = useId()
  return (
    <div className='space-y-2 w-full'>
      {label ? (
        <span className='w-full flex flex-row items-center gap-2'>
          <Label
            variant='default'
            className='w-full'
            htmlFor={`form-field-group-label-${id}`}
          >
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
      {!!description && descriptionPosition === 'top' && (
        <DescriptionAndError
          description={description}
          error={error}
          errorStyle='inline'
          formMessageId={`${id}-form-item-message`}
        />
      )}
      <div
        role='group'
        className={cn('flex', {
          'gap-x-2 items-start': layout === 'horizontal',
          'flex-col gap-y-2': layout === 'vertical',
          '[&_label]:font-light [&_label]:text-secondary-foreground': group,
          'items-center': centered,
        })}
        id={`form-field-group-${id}`}
        aria-labelledby={id}
        aria-describedby={description}
      >
        {children}
      </div>
      {!!description && descriptionPosition === 'bottom' && (
        <DescriptionAndError
          description={description}
          error={error}
          errorStyle='inline'
          formMessageId={`${id}-form-item-message`}
        />
      )}
    </div>
  )
}
