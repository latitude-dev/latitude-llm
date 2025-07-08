import { useEffect, useState } from 'react'
import { Input } from '../../atoms/Input'
import { Select } from '../../atoms/Select'
import { Text } from '../../atoms/Text'
import { CronValue } from './utils'

function getInitialValue(value: CronValue): number {
  if (value.minutes.startsWith('*/')) return Number(value.minutes.slice(2))
  if (value.hours.startsWith('*/')) return Number(value.hours.slice(2))
  if (value.dayOfMonth.startsWith('*/'))
    return Number(value.dayOfMonth.slice(2))
  return 1
}

function getInitialType(value: CronValue): 'minutes' | 'hours' | 'days' {
  if (value.minutes.startsWith('*')) return 'minutes'
  if (value.hours.startsWith('*')) return 'hours'
  if (value.dayOfMonth.startsWith('*')) return 'days'
  return 'minutes'
}

export function IntervalCronInput({
  value,
  onChange,
}: {
  value: CronValue
  onChange: (value: CronValue) => void
}) {
  const [intervalValue, setIntervalValue] = useState(() =>
    getInitialValue(value),
  )
  const [intervalType, setIntervalType] = useState<
    'minutes' | 'hours' | 'days'
  >(() => getInitialType(value))

  useEffect(() => {
    const cronPart = intervalValue > 1 ? `*/${intervalValue}` : '*'

    if (intervalType === 'minutes') {
      onChange({
        minutes: cronPart,
        hours: '*',
        dayOfMonth: '*',
        month: '*',
        dayOfWeek: '*',
      })
    } else if (intervalType === 'hours') {
      onChange({
        minutes: '0',
        hours: cronPart,
        dayOfMonth: '*',
        month: '*',
        dayOfWeek: '*',
      })
    } else {
      onChange({
        minutes: '0',
        hours: '0',
        dayOfMonth: cronPart,
        month: '*',
        dayOfWeek: '*',
      })
    }
  }, [intervalValue, intervalType, onChange])

  return (
    <div className='flex items-center gap-4'>
      <Text.H5 noWrap>Repeat every</Text.H5>
      <div className='w-16'>
        <Input
          type='number'
          value={intervalValue}
          onChange={(e) => setIntervalValue(Number(e.target.value))}
          min={1}
          className='w-16'
        />
      </div>
      <Select
        value={intervalType}
        name='intervalType'
        options={[
          { label: intervalValue > 1 ? 'minutes' : 'minute', value: 'minutes' },
          { label: intervalValue > 1 ? 'hours' : 'hour', value: 'hours' },
          { label: intervalValue > 1 ? 'days' : 'day', value: 'days' },
        ]}
        onChange={(v) => setIntervalType(v as 'minutes' | 'hours' | 'days')}
      />
    </div>
  )
}
