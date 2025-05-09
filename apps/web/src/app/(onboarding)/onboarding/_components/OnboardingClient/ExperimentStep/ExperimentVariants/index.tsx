import { ExperimentVariantWrapper } from '$/components/ExperimentVariantWrapper'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useCallback, useState } from 'react'

export type Variant = { name: string; model: string }

function ExperimentVariant({
  variant,
}: {
  variant: Variant
  setVariants: ReactStateDispatch<Variant[]>
}) {
  return <ExperimentVariantWrapper>{variant.name}</ExperimentVariantWrapper>
}

export function ExperimentVariants({
  isRunning,
  onRunExperiment,
}: {
  isRunning: boolean
  onRunExperiment: (args: { variants: Variant[] }) => Promise<void>
}) {
  const [variants, setVariants] = useState<Variant[]>([])
  const onClick = useCallback(() => {
    onRunExperiment({ variants })
  }, [variants, onRunExperiment])
  return (
    <div className='flex flex-row gap-y-2'>
      <div className='flex flex-col gap-2'>
        {variants.map((variant, index) => (
          <ExperimentVariant
            key={index}
            variant={variant}
            setVariants={setVariants}
          />
        ))}
      </div>
      <Button fancy onClick={onClick} disabled={isRunning}>
        Run experiment
      </Button>
    </div>
  )
}
