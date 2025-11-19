import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../atoms/Button'
import { FormField } from '../../atoms/FormField'
import { Popover } from '../../atoms/Popover'
import { TabSelector, TabSelectorOption } from '../../molecules/TabSelector'
import { Text } from '../../atoms/Text'
import { Icon } from '../../atoms/Icons'

import { IntervalCronInput } from './Interval'
import { ScheduleCronInput } from './Schedule'
import { CustomCronInput } from './Custom'
import { CronValue, CronTab, getInitialTab } from './utils'
import { useCronModel } from './useCronModel'

/** TabSelector options */
const TAB_OPTIONS = [
  { label: 'Interval', value: CronTab.Interval },
  { label: 'Schedule', value: CronTab.Schedule },
  { label: 'Custom', value: CronTab.Custom },
] as TabSelectorOption<CronTab>[]

function CronInputContent({
  value,
  disabled,
  onChange,
  valueError,
  initialTab,
}: {
  value: CronValue
  disabled?: boolean
  onChange: (value: CronValue) => void
  valueError?: string
  initialTab?: CronTab
}) {
  const [selectedTab, setSelectedTab] = useState<CronTab>(
    initialTab ?? CronTab.Custom,
  )

  useEffect(() => {
    if (!initialTab) return
    setSelectedTab(initialTab ?? CronTab.Custom)
  }, [initialTab])

  return (
    <div className='flex flex-col gap-4'>
      <TabSelector
        options={TAB_OPTIONS}
        selected={selectedTab}
        onSelect={setSelectedTab}
        disabled={disabled}
        linkWrapper={undefined}
      />
      <div className='flex flex-col gap-2 px-2'>
        {selectedTab === CronTab.Interval && (
          <IntervalCronInput
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        )}
        {selectedTab === CronTab.Schedule && (
          <ScheduleCronInput
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        )}
        {selectedTab === CronTab.Custom && (
          <CustomCronInput
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        )}
      </div>
      {valueError && (
        <div className='rounded-md bg-destructive p-4'>
          <Text.H6 color='destructiveForeground'>{valueError}</Text.H6>
        </div>
      )}
    </div>
  )
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
  const {
    localValue,
    stringValue,
    humanReadableValue,
    valueError,
    onCronChange,
  } = useCronModel({ value, onChange })

  const [initialTab, setInitialTab] = useState<CronTab>(CronTab.Custom)

  const handleOpen = useCallback(
    // Recalculate the best tab to show when the popover is opened
    (open: boolean) => {
      if (!open) return
      setInitialTab(getInitialTab(localValue, valueError))
    },
    [localValue, valueError],
  )

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
        <Popover.Root onOpenChange={handleOpen}>
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
            <CronInputContent
              value={localValue}
              onChange={onCronChange}
              valueError={valueError}
              initialTab={initialTab}
            />
          </Popover.Content>
        </Popover.Root>
      </FormField>
    </>
  )
}

export function CronFormField({
  name,
  value,
  onChange,
  required = false,
  disabled,
}: {
  name?: string
  value?: string
  onChange?: (value: string) => void
  required?: boolean
  disabled?: boolean
  errors?: string[]
}) {
  const {
    localValue,
    stringValue,
    humanReadableValue,
    valueError,
    onCronChange,
  } = useCronModel({ value, onChange })

  const [initialTab] = useState(getInitialTab(localValue, valueError))

  return (
    <div className='flex flex-col gap-2 border border-border rounded-xl overflow-hidden'>
      <div className='flex flex-col gap-2 p-2'>
        {name && (
          <input
            type='text'
            name={name}
            value={stringValue}
            readOnly
            hidden
            required={required}
          />
        )}
        <CronInputContent
          value={localValue}
          disabled={disabled}
          onChange={onCronChange}
          valueError={valueError}
          initialTab={initialTab}
        />
      </div>
      <div className='bg-secondary p-4 border-t border-border'>
        <Text.H6 color='foregroundMuted'>{humanReadableValue}</Text.H6>
      </div>
    </div>
  )
}

export { humanizeCronValue } from './utils'
