import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useExperiments } from '$/stores/experiments'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { useMemo } from 'react'

export function ExperimentFilter({
  selectedExperimentId,
  onChange,
}: {
  selectedExperimentId: number | undefined
  onChange: (experimentUuid: number | undefined) => void
}) {
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  const { data: experiments } = useExperiments({
    projectId: project.id,
    documentUuid: document.documentUuid,
  })

  const selectedExperiment = useMemo(
    () => experiments.find((e) => e.id === selectedExperimentId),
    [experiments, selectedExperimentId],
  )

  return (
    <Button variant='outline' onClick={() => onChange(undefined)}>
      <div className='flex flex-row items-center gap-2 max-w-40'>
        <Text.H5
          noWrap
          ellipsis
          color={selectedExperimentId ? 'primary' : 'foregroundMuted'}
        >
          {selectedExperiment?.name ?? 'Unknown experiment'}
        </Text.H5>
        <Icon name='close' color='foregroundMuted' />
      </div>
    </Button>
  )
}
