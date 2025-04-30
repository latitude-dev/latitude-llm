import { useCallback } from 'react'
import { ExperimentFormPayload } from '../../useExperimentFormPayload'
import { ExperimentVariantCard, NewVariantCard } from './ExperimentVariant'

const MAX_EXPERIMENTS = 3

export function ExperimentVariantsInput(payload: ExperimentFormPayload) {
  const { variants, setVariants, document } = payload

  const createNewVariant = useCallback(() => {
    setVariants((prev) => {
      const newVariants = [...prev]
      newVariants.push({ name: '', prompt: document?.content, parameters: [] })
      return newVariants
    })
  }, [document, setVariants])

  return (
    <div className='flex flex-row gap-4 max-w-full overflow-auto custom-scrollbar pt-4'>
      {variants.map((_, index) => {
        return <ExperimentVariantCard key={index} index={index} {...payload} />
      })}
      {variants.length < MAX_EXPERIMENTS && (
        <NewVariantCard onClick={createNewVariant} />
      )}
    </div>
  )
}
