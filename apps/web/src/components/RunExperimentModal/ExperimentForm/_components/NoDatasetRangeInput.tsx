import { Input } from '@latitude-data/web-ui/atoms/Input'
import { useEffect } from 'react'
import { ExperimentFormPayload } from '../useExperimentFormPayload'

export function NoDatasetRangeInput({
  setFromLine,
  setToLine,
  toLine,
}: ExperimentFormPayload) {
  useEffect(() => {
    setFromLine(0)
    setToLine(9)
  }, [setFromLine, setToLine])

  return (
    <Input
      type='number'
      name='count'
      label='How many logs to create'
      description='How many times the prompt will be executed in each experiment'
      value={(toLine ?? 0) + 1}
      placeholder='Number of runs'
      onChange={(e) => {
        const n = Number(e.target.value)
        if (!isNaN(n)) setToLine(n - 1)
      }}
      min={1}
      className='w-1/2'
    />
  )
}
