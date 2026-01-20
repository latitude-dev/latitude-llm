import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useExperimentComparison } from '$/stores/experimentComparison'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ExperimentWithScores } from '@latitude-data/core/schema/models/types/Experiment'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DiffViewer } from '@latitude-data/web-ui/molecules/DiffViewer'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { useMemo, useState } from 'react'
import { ExperimentItem } from './ExperimentItem/index'

export function ExperimentComparison({
  selectedExperimentUuids,
  onUnselectExperiment,
}: {
  selectedExperimentUuids: string[]
  onUnselectExperiment: (experimentUuid: string) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { experiments, evaluations, bestLogsMetadata } =
    useExperimentComparison({
      project: project as Project,
      commit: commit as Commit,
      document,
      experimentUuids: selectedExperimentUuids,
    })

  const [isComparing, setIsComparing] = useState(false)
  const baseline = useMemo(() => experiments?.[0], [experiments])
  const [compared, setCompared] = useState<ExperimentWithScores>()

  return (
    <div className='flex flex-shrink-0 flex-row w-full max-w-full relative border border-border rounded-lg overflow-auto custom-scrollbar'>
      {Object.values(experiments).map((experiment, index) => {
        const isFirst = index === 0
        const isLast =
          experiments.length > 2 && index === experiments.length - 1

        return (
          <ExperimentItem
            key={index}
            experiment={experiment}
            evaluations={evaluations}
            isFirst={isFirst}
            isLast={isLast}
            isSamePrompt={
              baseline?.metadata.prompt === experiment?.metadata.prompt
            }
            onUnselect={
              experiment
                ? () => onUnselectExperiment(experiment.uuid)
                : undefined
            }
            onCompare={
              experiment
                ? () => {
                    setIsComparing(true)
                    setCompared(experiment)
                  }
                : undefined
            }
            bestLogsMetadata={bestLogsMetadata}
          />
        )
      })}

      {experiments.length <= 2 && (
        <div className='w-full min-h-40 flex items-center justify-center bg-muted p-4'>
          <Text.H5 centered color='foregroundMuted'>
            {experiments.length === 0
              ? 'Select two or more experiments to compare'
              : 'Select another experiment to compare'}
          </Text.H5>
        </div>
      )}

      <Modal
        size='xl'
        title='Compare experiment prompts'
        description={
          <span>
            Comparing{' '}
            <Text.H5B color='successMutedForeground'>{compared?.name}</Text.H5B>{' '}
            against{' '}
            <Text.H5B color='destructiveMutedForeground'>
              {baseline?.name}
            </Text.H5B>
          </span>
        }
        footer={<CloseTrigger />}
        onOpenChange={setIsComparing}
        open={isComparing}
        dismissible
      >
        <div className='flex w-full h-[50vh]'>
          <ClientOnly loader={<TextEditorPlaceholder />}>
            <DiffViewer
              oldValue={baseline?.metadata.prompt}
              newValue={compared?.metadata.prompt}
            />
          </ClientOnly>
        </div>
      </Modal>
    </div>
  )
}
