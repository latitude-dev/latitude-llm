import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { BlankSlate } from '@latitude-data/web-ui/molecules/BlankSlate'

export function EmptyPage({
  isCreatingExperiment,
  setIsModalOpen,
}: {
  isCreatingExperiment: boolean
  setIsModalOpen: (open: boolean) => void
}) {
  return (
    <BlankSlate>
      <div className='flex flex-col w-full h-full items-center justify-center max-w-[600px] gap-6'>
        <Text.H4B color='secondaryForeground'>No Experiments</Text.H4B>
        <Text.H5 color='foregroundMuted' centered>
          Experiments allow you to test a version of your prompt at scale,
          gather detailed feedback through evaluations, and compare performance
          across different versions.
        </Text.H5>

        <Button
          isLoading={isCreatingExperiment}
          variant='default'
          fancy
          onClick={() => setIsModalOpen(true)}
        >
          Run Experiment
        </Button>
      </div>
    </BlankSlate>
  )
}
