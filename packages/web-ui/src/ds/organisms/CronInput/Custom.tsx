import { useCallback, useState } from 'react'
import { Input } from '../../atoms/Input'
import { Text } from '../../atoms/Text'
import { Button } from '../../atoms/Button'
import { cn } from '../../../lib/utils'
import type { CronValue } from './utils'

const FIELDS = [
  {
    label: 'Minutes',
    key: 'minutes' as const,
    description: 'At which minutes of each selected hours the task should run.',
    actions: [
      { value: '*', label: 'Every minute' },
      { value: '*/2', label: 'Every two minutes' },
      { value: '0', label: 'At the start of each hour' },
    ],
  },
  {
    label: 'Hours',
    key: 'hours' as const,
    description: 'At which hours of each selected days the task should run.',
    actions: [
      { value: '*', label: 'Every hour' },
      { value: '9-17', label: 'Every hour from 9AM to 5PM' },
      { value: '9,21', label: 'At 9AM and 9PM' },
      { value: '0', label: 'At 12AM' },
    ],
  },
  {
    label: 'Days of month',
    key: 'dayOfMonth' as const,
    description: 'On which days of the month the task should run.',
    actions: [
      { value: '*', label: 'Every day' },
      { value: '*/2', label: 'Every other day' },
      { value: '1', label: 'On the 1st day of each month' },
    ],
  },
  {
    label: 'Months',
    key: 'month' as const,
    description: 'In which months the task should run.',
    actions: [
      { value: '*', label: 'Every month' },
      { value: '1', label: 'In January' },
      { value: '6', label: 'In June' },
      { value: '12', label: 'In December' },
    ],
  },
  {
    label: 'Days of week',
    key: 'dayOfWeek' as const,
    description: 'On which days of the week the task should run.',
    actions: [
      { value: '*', label: 'Every day' },
      { value: '1,2,3,4,5', label: 'On weekdays (Mon–Fri)' },
      { value: '0,6', label: 'On weekends (Sat & Sun)' },
    ],
  },
] as const

export function CustomCronInput({
  value,
  onChange,
}: {
  value: CronValue
  onChange: (value: CronValue) => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)

  const handleChange = useCallback(
    (key: keyof CronValue, val: string) => {
      onChange({ ...value, [key]: val })
    },
    [value, onChange],
  )

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center gap-1'>
        {FIELDS.map((f, idx) => (
          <div className='flex flex-col w-full items-center' key={f.key}>
            <Text.H6 color='foregroundMuted'>{f.label}</Text.H6>
            <Input
              type='text'
              name={f.key}
              value={value[f.key]}
              placeholder='*'
              required
              onFocus={() => setActiveIndex(idx)}
              onChange={(e) => handleChange(f.key, e.target.value)}
              className={cn('w-24', { 'border-primary': activeIndex === idx })}
            />
          </div>
        ))}
      </div>
      <div className='flex flex-col gap-2 w-full bg-muted p-4 rounded-md'>
        <Text.H5B>{FIELDS[activeIndex]!.label}</Text.H5B>
        <Text.H5>{FIELDS[activeIndex]!.description}</Text.H5>
        <div className='flex flex-wrap gap-2'>
          {FIELDS[activeIndex]!.actions.map((action) => (
            <Button
              key={action.value}
              variant='outline'
              className='bg-muted'
              onClick={() => handleChange(FIELDS[activeIndex]!.key, action.value)}
            >
              <Text.H6 color='foregroundMuted'>{action.label}</Text.H6>
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
