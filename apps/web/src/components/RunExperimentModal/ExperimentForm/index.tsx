import { NumeredList } from '@latitude-data/web-ui/molecules/NumeredList'
import { ExperimentFormPayload } from './useExperimentFormPayload'
import { DatasetSelector } from './_components/DatasetSelector'
import { DatasetRowsInput } from './_components/DatasetRowsInput'
import { ParametersSelection } from './_components/ParametersSelection'
import { EvaluationsSelector } from './_components/EvaluationsSelector'
import { ExperimentVariantsInput } from './_components/VariantsInput'

export default function ExperimentModalForm(payload: ExperimentFormPayload) {
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
          <DatasetSelector {...payload} />
          <DatasetRowsInput {...payload} />
          <ParametersSelection {...payload} />
        </div>
      </NumeredList.Item>
    </NumeredList>
  )
}
