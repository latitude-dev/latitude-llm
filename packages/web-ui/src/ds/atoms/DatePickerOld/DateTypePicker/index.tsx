import { DatePickerType } from '../index'
import { cn } from '../../../../lib/utils'
import { ReactNode, Ref, useCallback, useState } from 'react'
import { Button } from '../../Button'

const BG_COLOR = 'bg-gray-100 dark:bg-border'

type Props = {
  type: DatePickerType
  onTypeChange?: ((type: DatePickerType) => void) | undefined
  input: ReactNode
  ref: Ref<HTMLDivElement>
}
export function DateTypePicker({
  ref,
  input,
  type: initialType,
  onTypeChange,
}: Props) {
  const [type, setType] = useState(initialType)
  const types = [DatePickerType.relative, DatePickerType.absolute]
  const onClick = useCallback(
    (newType: DatePickerType) => () => {
      setType(newType)
      setTimeout(() => {
        onTypeChange?.(newType)
      }, 200) // Css transition duration
    },
    [setType, onTypeChange],
  )
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-row items-center gap-x-1 rounded-md pr-1',
        BG_COLOR,
      )}
    >
      {input}
      {onTypeChange ? (
        <div className={cn('rounded flex items-center', BG_COLOR)}>
          <div className='relative flex'>
            {types.map((t) => (
              <Button
                key={t}
                variant='nope'
                size='icon'
                onClick={onClick(t)}
                aria-label={`Switch to ${t} date type`}
                className='rounded-full relative z-10'
                iconProps={{
                  name: t === DatePickerType.absolute ? 'calendar' : 'flash',
                  color: 'foregroundMuted',
                  darkColor: 'background',
                }}
              />
            ))}
            <div
              className={cn(
                'absolute top-0 left-0 w-6 h-full',
                'bg-background dark:bg-foreground rounded',
                'transition-transform duration-200 ease-in-out',
                {
                  'translate-x-0': type === types[0],
                  'translate-x-6': type === types[1],
                },
              )}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
