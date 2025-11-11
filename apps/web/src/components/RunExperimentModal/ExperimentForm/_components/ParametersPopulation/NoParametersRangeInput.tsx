import { ExperimentFormPayload } from '../../useExperimentFormPayload'
import { useEffect } from 'react'
import { Input } from '@latitude-data/web-ui/atoms/Input'

export function NoParametersRangeInput({
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
      label='How many times to run the prompt'
      description='Your prompt does not have any parameters. Instead, select how many times the prompt will be executed for each variant.'
      value={(toLine ?? 0) + 1}
      placeholder='Number of runs'
      onChange={(e) => {
        const n = Number(e.target.value)
        if (!isNaN(n)) setToLine(n - 1)
      }}
      min={1}
      className='w-2/3'
    />
  )
}
