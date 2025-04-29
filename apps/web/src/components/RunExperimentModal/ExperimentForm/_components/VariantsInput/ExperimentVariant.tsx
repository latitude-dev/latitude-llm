import { useMetadata } from '$/hooks/useMetadata'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback, useEffect } from 'react'
import { ExperimentFormPayload } from '../../useExperimentFormPayload'
import { VariantPromptSettings } from './PromptSettings'

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
  document,
}: ExperimentFormPayload & { index: number }) {
  const { name, prompt } = variants[index]!

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

  const setPrompt = useCallback(
    (prompt: string) => {
      setVariants((prev) => {
        const newVariants = [...prev]
        newVariants[index]!.prompt = prompt
        return newVariants
      })
    },
    [setVariants, index],
  )

  const setParameters = useCallback(
    (parameters: string[]) => {
      setVariants((prev) => {
        const newVariants = [...prev]
        newVariants[index]!.parameters = parameters
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

  const { metadata, runReadMetadata } = useMetadata()
  useEffect(() => {
    runReadMetadata({
      promptlVersion: document.promptlVersion,
      prompt,
      document,
    })
  }, [document, prompt, runReadMetadata])

  useEffect(() => {
    if (!metadata) return
    setParameters(Array.from(metadata.parameters))
  }, [metadata, setParameters])

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
      <VariantPromptSettings
        prompt={prompt}
        setPrompt={setPrompt}
        metadata={metadata}
      />
    </div>
  )
}
