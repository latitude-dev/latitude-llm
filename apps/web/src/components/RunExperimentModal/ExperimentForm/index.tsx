import { NumeredList } from '@latitude-data/web-ui/molecules/NumeredList'
import { ExperimentFormPayload } from './useExperimentFormPayload'
import { EvaluationsSelector } from './_components/EvaluationsSelector'
import { ExperimentVariantsInput } from './_components/VariantsInput'
import { ExperimentSimulationSettings } from './_components/SimulationSettings'
import { ParametersPopulationSettings } from './_components/ParametersPopulation'

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

      <NumeredList.Item title='Populate the parameters'>
        <ParametersPopulationSettings {...payload} />
      </NumeredList.Item>

      <NumeredList.Item title='Configure the simulation'>
        <ExperimentSimulationSettings {...payload} />
      </NumeredList.Item>
    </NumeredList>
  )
}
