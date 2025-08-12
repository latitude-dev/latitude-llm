// index.tsx
import { useCallback, useState } from 'react'
import { Button } from '../../atoms/Button'
import { FormField } from '../../atoms/FormField'
import { Popover } from '../../atoms/Popover'
import { TabSelector, TabSelectorOption } from '../../molecules/TabSelector'
import { Text } from '../../atoms/Text'
import cronstrue from 'cronstrue'
import { Icon } from '../../atoms/Icons'

import { IntervalCronInput } from './Interval'
import { ScheduleCronInput } from './Schedule'
import { CustomCronInput } from './Custom'
import {
  CronValue,
  parseCronValue,
  formatCronValue,
  isIntervalCron,
  isScheduleCron,
} from './utils'

/** Editing modes */
export enum CronTab {
  Interval = 'interval',
  Schedule = 'schedule',
  Custom = 'custom',
}

/** TabSelector options */
const TAB_OPTIONS = [
  { label: 'Interval', value: CronTab.Interval },
  { label: 'Schedule', value: CronTab.Schedule },
  { label: 'Custom', value: CronTab.Custom },
] as TabSelectorOption<CronTab>[]

export function humanizeCronValue(value: string): string {
  try {
    return cronstrue.toString(value, {
      throwExceptionOnParseError: true,
    })
  } catch (err) {
    return 'Invalid cron expression'
  }
}

export function CronInput({
  label,
  description,
  name,
  value,
  onChange,
  required = false,
  disabled,
  errors,
  fullWidth,
}: {
  label?: string
  description?: string
  name: string
  value?: string
  onChange?: (value: string) => void
  required?: boolean
  disabled?: boolean
  errors?: string[]
  fullWidth?: boolean
}) {
  const [localValue, setLocalValue] = useState<CronValue>(() =>
    parseCronValue(value ?? '* * * * *'),
  )
  const [stringValue, setStringValue] = useState<string>(
    () => value ?? '* * * * *',
  )
  const [humanReadableValue, setHumanReadableValue] = useState<string>(() =>
    cronstrue.toString(value ?? '* * * * *'),
  )
  const [valueError, setValueError] = useState<string>()

  const handleChange = useCallback(
    (newValue: CronValue) => {
      setLocalValue(newValue)
      const next = formatCronValue(newValue)

      try {
        const human = cronstrue.toString(next, {
          throwExceptionOnParseError: true,
        })
        setStringValue(next)
        setHumanReadableValue(human)
        setValueError(undefined)
        onChange?.(next)
      } catch (err) {
        setValueError(err as string) // For some reason, cronstrue throws a string
      }
    },
    [onChange],
  )

  const [selectedTab, setSelectedTab] = useState<CronTab>(CronTab.Custom)

  const getAutomaticTab = useCallback((): CronTab => {
    if (valueError) return CronTab.Custom
    if (localValue.month !== '*') return CronTab.Custom
    if (isIntervalCron(localValue)) return CronTab.Interval
    if (isScheduleCron(localValue)) return CronTab.Schedule
    return CronTab.Custom
  }, [localValue, valueError])

  return (
    <>
      <input
        type='text'
        name={name}
        value={stringValue}
        readOnly
        hidden
        required={required}
      />
      <FormField label={label} description={description} errors={errors}>
        <Popover.Root
          onOpenChange={(open) => {
            if (open) {
              setSelectedTab(getAutomaticTab())
            }
          }}
        >
          <Popover.Trigger asChild>
            <Button
              variant='outline'
              disabled={disabled}
              className='truncate'
              fullWidth={fullWidth}
            >
              <div className='w-full flex items-center gap-2 max-w-full overflow-hidden truncate'>
                <Icon
                  name='repeat'
                  color='foregroundMuted'
                  className='min-w-4'
                />
                <Text.H5 color='foregroundMuted' noWrap ellipsis>
                  {humanReadableValue}
                </Text.H5>
              </div>
            </Button>
          </Popover.Trigger>
          <Popover.Content
            side='bottom'
            align='start'
            size='large'
            className='w-[600px]'
          >
            <TabSelector
              options={TAB_OPTIONS}
              selected={selectedTab}
              onSelect={setSelectedTab}
            />
            {selectedTab === CronTab.Interval && (
              <IntervalCronInput value={localValue} onChange={handleChange} />
            )}
            {selectedTab === CronTab.Schedule && (
              <ScheduleCronInput value={localValue} onChange={handleChange} />
            )}
            {selectedTab === CronTab.Custom && (
              <CustomCronInput value={localValue} onChange={handleChange} />
            )}
            {valueError && (
              <div className='rounded-md bg-destructive p-4'>
                <Text.H6 color='destructiveForeground'>{valueError}</Text.H6>
              </div>
            )}
          </Popover.Content>
        </Popover.Root>
      </FormField>
    </>
  )
}
