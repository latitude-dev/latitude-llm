import { useCallback, useState } from 'react'
import { CronValue, formatCronValue, parseCronValue } from './utils'
import { humanizeCronValue } from './utils'

type UseCronModelArgs = {
  value?: string
  onChange?: (value: string) => void
}

export function useCronModel({ value, onChange }: UseCronModelArgs) {
  const [localValue, setLocalValue] = useState<CronValue>(() =>
    parseCronValue(value ?? '* * * * *'),
  )
  const [stringValue, setStringValue] = useState<string>(
    () => value ?? '* * * * *',
  )
  const [humanReadableValue, setHumanReadableValue] = useState<string>(() =>
    humanizeCronValue(value ?? '* * * * *'),
  )
  const [valueError, setValueError] = useState<string>()

  const onCronChange = useCallback(
    (nextValue: CronValue) => {
      setLocalValue(nextValue)
      const next = formatCronValue(nextValue)
      try {
        const human = humanizeCronValue(next)
        setStringValue(next)
        setHumanReadableValue(human)
        setValueError(undefined)
        onChange?.(next)
      } catch (err) {
        // cronstrue may throw a string
        setValueError(err as string)
      }
    },
    [onChange],
  )

  return {
    localValue,
    stringValue,
    humanReadableValue,
    valueError,
    onCronChange,
  }
}
