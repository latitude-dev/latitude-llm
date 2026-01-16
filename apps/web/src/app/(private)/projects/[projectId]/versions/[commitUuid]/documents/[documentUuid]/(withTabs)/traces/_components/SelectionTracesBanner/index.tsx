import { FloatingPanel } from '@latitude-data/web-ui/atoms/FloatingPanel'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { DownloadSpansButton } from './DownloadSpansButton'
import { SaveSpansAsDatasetModal } from './SaveSpansAsDatasetModal'
import { Span } from '@latitude-data/constants'
import { useSelectedSpans } from './SaveSpansAsDatasetModal/useSelectedSpans'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { SpansFilters } from '$/lib/schemas/filters'

export function SelectionTracesBanner({
  selectableState,
  spans,
  filters,
}: {
  selectableState: SelectableRowsHook
  spans: Span[]
  filters: SpansFilters
}) {
  const previewSpansState = useSelectedSpans({
    selectableState,
    spans,
  })
  return (
    <>
      <div className='z-10 sticky bottom-4 w-full'>
        <div className='flex justify-center'>
          <FloatingPanel visible={selectableState.selectedCount > 0}>
            <div className='flex flex-row items-center gap-x-4'>
              <div className='flex flex-row gap-x-2'>
                <Button
                  fancy
                  disabled={selectableState.selectedCount === 0}
                  onClick={previewSpansState.onClickShowPreview}
                >
                  Add {selectableState.selectedCount} spans to dataset
                </Button>
                <DownloadSpansButton
                  selectableState={selectableState}
                  spans={spans}
                  filters={filters}
                />
              </div>
              <Tooltip
                asChild
                trigger={
                  <Button
                    iconProps={{
                      name: 'close',
                    }}
                    className='p-0'
                    variant='ghost'
                    onClick={selectableState.clearSelections}
                  />
                }
              >
                Clear selection
              </Tooltip>
            </div>
          </FloatingPanel>
        </div>
      </div>
      <SaveSpansAsDatasetModal {...previewSpansState} />
    </>
  )
}
