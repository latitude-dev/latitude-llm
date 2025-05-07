import { ExperimentFormPayload } from '../../useExperimentFormPayload'
import { ExperimentVariantCard, NewVariantCard } from './ExperimentVariant'

const MAX_EXPERIMENTS = 3

export function ExperimentVariantsInput(payload: ExperimentFormPayload) {
  const { variants, addNewVariant } = payload

  return (
    <div className='flex flex-row gap-4 max-w-full overflow-auto custom-scrollbar pt-4'>
      {variants.map((_, index) => {
        return <ExperimentVariantCard key={index} index={index} {...payload} />
      })}
      {variants.length < MAX_EXPERIMENTS && (
        <NewVariantCard onClick={addNewVariant} />
      )}
    </div>
  )
}
