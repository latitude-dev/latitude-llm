import { ButtonTrigger, Popover } from '@latitude-data/web-ui/atoms/Popover'
import { Column } from '@latitude-data/core/schema'
import { CheckboxAtom } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Checkbox/Primitive'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { usePreviewTable } from './usePreviewTable'

type Props = {
  columns: Column[]
  previewStaticColumns?: Map<string, boolean>
  previewParameterColumns?: Map<string, boolean>
  onSelectStaticColumn?: (column: string) => void
  onSelectParameterColumn?: (column: string) => void
}

export const ColumnSelector = ({
  columns,
  previewStaticColumns,
  previewParameterColumns,
  onSelectStaticColumn,
  onSelectParameterColumn,
}: Props) => {
  const { isColumnSelected, handleSelectColumn } = usePreviewTable({
    previewStaticColumns,
    previewParameterColumns,
    onSelectStaticColumn,
    onSelectParameterColumn,
  })

  return (
    <Popover.Root>
      <ButtonTrigger
        buttonVariant={'outline'}
        iconProps={{
          name: 'settings',
          color: 'foreground',
        }}
      />
      <Popover.Content
        side='bottom'
        align='end'
        size='large'
        inPortal={false} // Without this, the popover content cannot be scrolled correctly
        scrollable
        className='gap-y-2'
      >
        <Text.H5>Column selection</Text.H5>
        <Text.H6 color='foregroundMuted'>
          Customize the columns to be downloaded
        </Text.H6>
        <div className='flex flex-col mt-2 gap-y-1'>
          {columns.map((column) => (
            <div
              className={cn(
                'w-full cursor-pointer select-none py-2 flex gap-x-4 items-center transition-opacity pl-3 rounded-md hover:bg-muted',
                !isColumnSelected(column) && 'opacity-60',
              )}
              onClick={() => handleSelectColumn(column)}
            >
              <CheckboxAtom checked={isColumnSelected(column)} />
              <Text.H5>{column.name}</Text.H5>
            </div>
          ))}
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
