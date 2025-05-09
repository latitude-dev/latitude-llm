import { ChangeEvent, useCallback } from 'react'
import { ExperimentVariantWrapper } from '$/components/ExperimentVariantWrapper'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { type ExperimentVariant } from '$/actions/experiments'
import { type Variants } from '../index'
import useModelOptions from '$/hooks/useModelOptions'
import { Providers } from '@latitude-data/constants'
import { envClient } from '$/envClient'

function VariantItem({
  position,
  variant,
  setVariants,
}: {
  position: 'first' | 'second'
  variant: ExperimentVariant
  setVariants: ReactStateDispatch<Variants>
}) {
  const setValue = useCallback(
    (attribute: 'model' | 'name') => (event: ChangeEvent<HTMLInputElement>) => {
      setVariants((prev) => {
        prev[position][attribute] = event.target.value
        return { ...prev }
      })
    },
    [setVariants, position],
  )
  const setName = useCallback(() => setValue('name'), [setValue])
  const setModel = useCallback(() => setValue('model'), [setValue])
  const modelOptions = useModelOptions({
    provider: Providers.OpenAI,
    name: envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
  })

  return (
    <ExperimentVariantWrapper expand>
      <Input
        label='Experiment Name'
        type='text'
        value={variant.name}
        onChange={setName}
        placeholder='Describe this variant'
      />
      <Select
        value={variant.model}
        name='model'
        label='Model'
        placeholder='Select a model'
        options={modelOptions}
        onChange={setModel}
        required
      />
    </ExperimentVariantWrapper>
  )
}

export function ExperimentVariants({
  firstVariant,
  secondVariant,
  setVariants,
}: {
  firstVariant: ExperimentVariant
  secondVariant: ExperimentVariant
  setVariants: ReactStateDispatch<Variants>
}) {
  return (
    <div className='w-full flex flex-row gap-2'>
      <VariantItem
        position='first'
        variant={firstVariant}
        setVariants={setVariants}
      />
      <VariantItem
        position='second'
        variant={secondVariant}
        setVariants={setVariants}
      />
    </div>
  )
}
