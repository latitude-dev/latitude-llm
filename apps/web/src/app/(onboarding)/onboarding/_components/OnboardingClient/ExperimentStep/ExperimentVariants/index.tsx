import { type ChangeEvent, useCallback } from 'react'
import { ExperimentVariantWrapper } from '$/components/ExperimentVariantWrapper'
import type { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import type { ExperimentVariant } from '@latitude-data/constants/experiments'
import type { Variants } from '../index'
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
  const onChangeName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setVariants((prev) => {
        prev[position].name = event.target.value
        return { ...prev }
      })
    },
    [setVariants, position],
  )
  const onChangeModel = useCallback(
    (value: string) => {
      setVariants((prev) => {
        prev[position].model = value
        return { ...prev }
      })
    },
    [setVariants, position],
  )
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
        onChange={onChangeName}
        placeholder='Describe this variant'
      />
      <Select
        value={variant.model}
        name='model'
        label='Model'
        placeholder='Select a model'
        options={modelOptions}
        onChange={onChangeModel}
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
      <VariantItem position='first' variant={firstVariant} setVariants={setVariants} />
      <VariantItem position='second' variant={secondVariant} setVariants={setVariants} />
    </div>
  )
}
