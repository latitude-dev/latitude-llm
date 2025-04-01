import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FloatingPanel } from '@latitude-data/web-ui/atoms/FloatingPanel'

export function RefineEvaluationResults({
  onClickRefine,
  clearSelections,
  selectedCount,
  refinementEnabled,
}: {
  onClickRefine: () => void
  clearSelections: () => void
  selectedCount: number
  refinementEnabled: boolean
}) {
  if (!refinementEnabled) return null

  return (
    <div className='flex justify-center sticky bottom-4 pointer-events-none'>
      <FloatingPanel visible={selectedCount > 0}>
        <div className='flex flex-row justify-between gap-x-4'>
          <Button disabled={selectedCount === 0} fancy onClick={onClickRefine}>
            Refine prompt
          </Button>
          <Button fancy variant='outline' onClick={clearSelections}>
            Clear selection
          </Button>
        </div>
      </FloatingPanel>
    </div>
  )
}
