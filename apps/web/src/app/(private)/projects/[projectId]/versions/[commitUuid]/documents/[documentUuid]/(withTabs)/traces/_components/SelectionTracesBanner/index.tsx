import { FloatingPanel } from '@latitude-data/web-ui/atoms/FloatingPanel'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { DownloadConversationsButton } from './DownloadSpansButton'
import { SaveSpansAsDatasetModal } from './SaveSpansAsDatasetModal'
import { useSelectedConversations } from './SaveSpansAsDatasetModal/useSelectedSpans'
import { SelectableRowsHook, SelectionMode } from '$/hooks/useSelectableRows'
import { SpansFilters } from '$/lib/schemas/filters'
import { useMemo } from 'react'

function getButtonText({
  selectionMode,
  selectedCount,
}: {
  selectionMode: SelectionMode
  selectedCount: number
}) {
  if (selectionMode === 'ALL') {
    return 'Add all conversations to dataset'
  }
  if (selectionMode === 'ALL_EXCEPT') {
    return 'Add all conversations (except excluded) to dataset'
  }
  return `Add ${selectedCount} conversations to dataset`
}

export function SelectionTracesBanner({
  selectableState,
  filters,
}: {
  selectableState: SelectableRowsHook
  filters: SpansFilters
}) {
  const previewState = useSelectedConversations({
    selectableState,
  })
  const buttonText = useMemo(
    () =>
      getButtonText({
        selectionMode: selectableState.selectionMode,
        selectedCount: selectableState.selectedCount,
      }),
    [selectableState.selectionMode, selectableState.selectedCount],
  )
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
                  onClick={previewState.onClickShowPreview}
                >
                  {buttonText}
                </Button>
                <DownloadConversationsButton
                  selectableState={selectableState}
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
      <SaveSpansAsDatasetModal {...previewState} />
    </>
  )
}
