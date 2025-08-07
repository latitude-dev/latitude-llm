import { ChangeEvent, useEffect, useState } from 'react'
import { Button } from '../../atoms/Button'
import { Input } from '../../atoms/Input'
import { Text } from '../../atoms/Text'
import { CronValue } from './utils'

type SelectedDays = [
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
]

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Build a CronValue for the selected weekdays */
function buildCronForDays(selected: SelectedDays): CronValue {
  const allOrNone = selected.every(Boolean) || selected.every((d) => !d)
  const dow = allOrNone
    ? '*'
    : selected
        .map((d, i) => (d ? i : null))
        .filter((i): i is number => i !== null)
        .join(',')

  return {
    minutes: '0',
    hours: '0',
    dayOfMonth: '*',
    month: '*',
    dayOfWeek: dow,
  }
}

function parseSelectedDays(expr: string): SelectedDays {
  if (expr === '*') {
    return [false, false, false, false, false, false, false]
  }
  const parts = expr.split(',').map((n) => parseInt(n, 10))
  return Array.from({ length: 7 }, (_, i) => parts.includes(i)) as SelectedDays
}

function getInitialHour({ hours }: CronValue): string {
  return /^\d+$/.test(hours) ? hours : '0'
}
function getInitialMinute({ minutes }: CronValue): string {
  return /^\d+$/.test(minutes) ? minutes : '0'
}

export function ScheduleCronInput({
  value,
  onChange,
}: {
  value: CronValue
  onChange: (value: CronValue) => void
}) {
  const [selectedDays, setSelectedDays] = useState<SelectedDays>(() =>
    parseSelectedDays(value.dayOfWeek),
  )
  const [hour, setHour] = useState<string>(() => getInitialHour(value))
  const [minute, setMinute] = useState<string>(() => getInitialMinute(value))

  useEffect(() => {
    setSelectedDays(parseSelectedDays(value.dayOfWeek))
    setHour(getInitialHour(value))
    setMinute(getInitialMinute(value))
  }, [value])

  const toggleDay = (idx: number) => {
    const updated = [...selectedDays] as SelectedDays
    updated[idx] = !updated[idx]
    setSelectedDays(updated)
    const base = buildCronForDays(updated)
    onChange({ ...base, hours: hour, minutes: minute })
  }

  const handleHourChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setHour(val)
    const base = buildCronForDays(selectedDays)
    onChange({ ...base, hours: val, minutes: minute })
  }

  const handleMinuteChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setMinute(val)
    const base = buildCronForDays(selectedDays)
    onChange({ ...base, hours: hour, minutes: val })
  }

  return (
    <div className='flex flex-col gap-4'>
      <Text.H5 noWrap>Days of the week</Text.H5>
      <div className='flex items-center gap-2'>
        {DAYS_OF_WEEK.map((label, idx) => (
          <Button
            key={label}
            variant={selectedDays[idx] ? 'default' : 'outline'}
            onClick={() => toggleDay(idx)}
          >
            <Text.H5
              color={selectedDays[idx] ? 'background' : 'foregroundMuted'}
            >
              {label}
            </Text.H5>
          </Button>
        ))}
      </div>
      <Text.H5 noWrap>Time</Text.H5>
      <div className='flex items-center gap-2'>
        <div className='w-16'>
          <Input
            type='number'
            value={hour.padStart(2, '0')}
            onChange={handleHourChange}
            min={0}
            max={23}
            className='w-16'
          />
        </div>
        <Text.H5 noWrap>:</Text.H5>
        <div className='w-16'>
          <Input
            type='number'
            value={minute.padStart(2, '0')}
            onChange={handleMinuteChange}
            min={0}
            max={59}
            className='w-16'
          />
        </div>
      </div>
    </div>
  )
}
