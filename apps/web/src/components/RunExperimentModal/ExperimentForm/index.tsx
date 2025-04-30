import { NumeredList } from '@latitude-data/web-ui/molecules/NumeredList'
import { ExperimentFormPayload } from './useExperimentFormPayload'
import { DatasetSelector } from './_components/DatasetSelector'
import { DatasetRowsInput } from './_components/DatasetRowsInput'
import { ParametersSelection } from './_components/ParametersSelection'
import { EvaluationsSelector } from './_components/EvaluationsSelector'
import { useMemo } from 'react'
import { ExperimentVariantsInput } from './_components/VariantsInput'

export default function DatasetForm(payload: ExperimentFormPayload) {
  const parameters = useMemo(() => {
    const set = new Set<string>([
      ...payload.variants.flatMap((v) => v.parameters),
    ])
    return Array.from(set)
  }, [payload.variants])

  return (
    <NumeredList>
      <NumeredList.Item
        title='Define the experiment variants'
        className='gap-y-0'
      >
        <ExperimentVariantsInput {...payload} />
      </NumeredList.Item>

      <NumeredList.Item title='Pick the evaluations you want to run'>
        <EvaluationsSelector {...payload} />
      </NumeredList.Item>

      <NumeredList.Item title='Select your dataset and configure parameters'>
        <div className='flex flex-col gap-2'>
          <DatasetSelector {...payload} parameters={parameters} />
          <DatasetRowsInput {...payload} />
          <ParametersSelection {...payload} parameters={parameters} />
        </div>
      </NumeredList.Item>
    </NumeredList>
  )
}
