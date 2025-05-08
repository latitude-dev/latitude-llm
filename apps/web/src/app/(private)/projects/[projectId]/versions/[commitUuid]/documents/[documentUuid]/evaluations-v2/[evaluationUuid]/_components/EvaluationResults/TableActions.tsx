import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import {
  PlaygroundAction,
  usePlaygroundAction,
} from '$/hooks/usePlaygroundAction'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { EvaluationMetric, EvaluationType } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FloatingPanel } from '@latitude-data/web-ui/atoms/FloatingPanel'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'

export function EvaluationResultsTableActions<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  selectableState,
  refinementEnabled,
  isLoading,
}: {
  selectableState: ReturnType<typeof useSelectableRows>
  refinementEnabled: boolean
  isLoading?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const { setPlaygroundAction } = usePlaygroundAction({
    action: PlaygroundAction.RefinePrompt,
    project: project,
    commit: commit,
    document: document,
  })

  const isDisabled =
    isLoading || !refinementEnabled || !selectableState.selectedCount

  return (
    <div className='flex justify-center sticky bottom-4 pointer-events-none'>
      <FloatingPanel visible={selectableState.selectedCount > 0}>
        <div className='flex flex-row justify-between gap-x-4'>
          <Button
            fancy
            onClick={() =>
              setPlaygroundAction({
                evaluationUuid: evaluation.uuid,
                resultUuids: selectableState.getSelectedRowIds().map(String),
                version: 'v2',
              })
            }
            disabled={isDisabled}
          >
            Refine prompt
          </Button>
          <Button
            fancy
            variant='outline'
            onClick={() => selectableState.clearSelections()}
          >
            Clear selection
          </Button>
        </div>
      </FloatingPanel>
    </div>
  )
}
