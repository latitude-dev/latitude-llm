import { useCallback, ChangeEvent, useMemo, useState } from 'react'
import { Input } from '../../atoms/Input'
import { Select, type SelectOption } from '../../atoms/Select'
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

type IntervalType = 'minutes' | 'hours' | 'days'
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
  const [intervalType, setIntervalType] = useState<IntervalType>(() =>
    getInitialType(value),
  )

  const changeCron = useCallback(
    ({ newValue, newType }: { newValue: number; newType: IntervalType }) => {
      const cronPart = newValue > 1 ? `*/${newValue}` : '*'

      if (newType === 'minutes') {
        onChange({
          minutes: cronPart,
          hours: '*',
          dayOfMonth: '*',
          month: '*',
          dayOfWeek: '*',
        })
      } else if (newType === 'hours') {
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
    },
    [onChange],
  )

  const onChangeValue = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value)
      setIntervalValue(value)
      changeCron({ newValue: value, newType: intervalType })
    },
    [setIntervalValue, intervalType, changeCron],
  )

  const intervalOptions = useMemo<SelectOption<IntervalType>[]>(
    () => [
      { label: intervalValue > 1 ? 'minutes' : 'minute', value: 'minutes' },
      { label: intervalValue > 1 ? 'hours' : 'hour', value: 'hours' },
      { label: intervalValue > 1 ? 'days' : 'day', value: 'days' },
    ],
    [intervalValue],
  )
  const onChangeInterval = useCallback(
    (type: IntervalType) => {
      setIntervalType(type)
      changeCron({ newValue: intervalValue, newType: type })
    },
    [setIntervalType, intervalValue, changeCron],
  )

  return (
    <div className='flex items-center gap-4'>
      <Text.H5 noWrap>Repeat every</Text.H5>
      <div className='w-16'>
        <Input
          type='number'
          value={intervalValue}
          onChange={onChangeValue}
          min={1}
          className='w-16'
        />
      </div>
      <Select<IntervalType>
        value={intervalType}
        name='intervalType'
        options={intervalOptions}
        onChange={onChangeInterval}
      />
    </div>
  )
}
