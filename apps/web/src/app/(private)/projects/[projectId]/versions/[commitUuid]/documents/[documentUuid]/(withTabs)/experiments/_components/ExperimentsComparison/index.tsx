import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ExperimentItem } from './ExperimentItem/index'
import { useExperimentComparison } from '$/stores/experimentComparison'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Project } from '@latitude-data/core/schema/models/types/Project'
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

  return (
    <div className='flex flex-shrink-0 flex-row w-full max-w-full relative border border-border rounded-lg overflow-auto custom-scrollbar'>
      {Object.values(experiments).map((experiment, index) => {
        const isLast =
          experiments.length > 2 && index === experiments.length - 1

        return (
          <ExperimentItem
            key={index}
            experiment={experiment}
            evaluations={evaluations}
            isLast={isLast}
            onUnselect={
              experiment
                ? () => onUnselectExperiment(experiment.uuid)
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
    </div>
  )
}
