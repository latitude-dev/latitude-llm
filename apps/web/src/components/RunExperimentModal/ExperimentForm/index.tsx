import { NumeredList } from '@latitude-data/web-ui/molecules/NumeredList'
import { ExperimentFormPayload } from './useExperimentFormPayload'
import { DatasetSelector } from './_components/DatasetSelector'
import { DatasetRowsInput } from './_components/DatasetRowsInput'
import { ParametersSelection } from './_components/ParametersSelection'
import { EvaluationsSelector } from './_components/EvaluationsSelector'
import { ExperimentNameInput } from './_components/NameInput'

export default function DatasetForm(payload: ExperimentFormPayload) {
  return (
    <NumeredList>
      <NumeredList.Item title='Name your experiment'>
        <ExperimentNameInput {...payload} />
      </NumeredList.Item>

      <NumeredList.Item title='Select what evaluations to run'>
        <EvaluationsSelector {...payload} />
      </NumeredList.Item>

      <NumeredList.Item title='Pick dataset'>
        <DatasetSelector {...payload} />
      </NumeredList.Item>

      <NumeredList.Item title='Select lines from dataset' width='w-1/2'>
        <DatasetRowsInput {...payload} />
      </NumeredList.Item>

      <NumeredList.Item
        title='Select the columns that contain the data to fill out the variables'
        width='w-1/2'
      >
        <ParametersSelection {...payload} />
      </NumeredList.Item>
    </NumeredList>
  )
}
