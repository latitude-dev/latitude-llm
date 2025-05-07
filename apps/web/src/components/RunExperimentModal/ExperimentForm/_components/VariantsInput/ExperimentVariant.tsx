import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback } from 'react'
import { ExperimentFormPayload } from '../../useExperimentFormPayload'
import {
  VariantPromptSettings,
  VariantPromptSettingsPlaceholder,
} from './PromptSettings'

export function NewVariantCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      className={cn(
        'flex flex-col p-4 min-w-[300px] items-center justify-center',
        'border border-border border-dashed rounded-md',
        'cursor-pointer hover:bg-secondary',
      )}
      onClick={onClick}
    >
      <Icon color='foregroundMuted' name='addSquare' size='xlarge' />
    </div>
  )
}

export function ExperimentVariantCard({
  index,
  variants,
  setVariants,
  isLoadingMetadata,
}: ExperimentFormPayload & { index: number }) {
  const { name, provider, model, temperature } = variants[index]!

  const setName = useCallback(
    (name: string) => {
      setVariants((prev) => {
        const newVariants = [...prev]
        newVariants[index]!.name = name
        return newVariants
      })
    },
    [setVariants, index],
  )

  const setProvider = useCallback(
    (newProvider: string) => {
      setVariants((prev) => {
        const newVariants = [...prev]
        newVariants[index]!.provider = newProvider
        return newVariants
      })
    },
    [setVariants, index],
  )

  const setModel = useCallback(
    (newModel: string) => {
      setVariants((prev) => {
        const newVariants = [...prev]
        const prevModel = newVariants[index]?.model
        newVariants[index]!.model = newModel

        if (prevModel?.length) {
          // Change the model from the name too
          const prevName = newVariants[index]!.name
          const newName = prevName.replace(prevModel, newModel)

          newVariants[index]!.name = newName
        }

        return newVariants
      })
    },
    [setVariants, index],
  )

  const setTemperature = useCallback(
    (newTemperature: number) => {
      setVariants((prev) => {
        const newVariants = [...prev]
        newVariants[index]!.temperature = newTemperature
        return newVariants
      })
    },
    [setVariants, index],
  )

  const discardVariant = useCallback(() => {
    setVariants((prev) => {
      const newVariants = [...prev]
      newVariants.splice(index, 1)
      return newVariants
    })
  }, [setVariants, index])

  return (
    <div className='flex flex-col relative gap-2 p-4 border border-border rounded-md min-w-[300px]'>
      {variants.length > 1 && (
        <div className='absolute top-0 right-0 translate-x-1/2 -translate-y-1/2'>
          <Button
            variant='outline'
            className='p-0 rounded-full w-6 h-6'
            iconProps={{
              name: 'close',
              className: 'min-w-4 min-h-4',
            }}
            onClick={discardVariant}
          />
        </div>
      )}
      <Input
        label='Experiment Name'
        type='text'
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder='Describe this variant'
      />
      {isLoadingMetadata ? (
        <VariantPromptSettingsPlaceholder />
      ) : (
        <VariantPromptSettings
          provider={provider}
          setProvider={setProvider}
          model={model}
          setModel={setModel}
          temperature={temperature}
          setTemperature={setTemperature}
        />
      )}
    </div>
  )
}
