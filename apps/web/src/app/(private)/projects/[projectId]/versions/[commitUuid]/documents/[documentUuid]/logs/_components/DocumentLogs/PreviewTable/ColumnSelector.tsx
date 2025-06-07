import { ButtonTrigger, Popover } from '@latitude-data/web-ui/atoms/Popover'
import { Column } from '@latitude-data/core/schema'
import { CheckboxAtom } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Checkbox/Primitive'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'

export const ColumnSelector = ({
  columns,
  isColumnSelected,
  onSelectColumn,
}: {
  columns: Column[]
  isColumnSelected: (column: Column) => boolean
  onSelectColumn: (column: Column) => void
}) => {
  return (
    <Popover.Root>
      <ButtonTrigger
        buttonVariant={'outline'}
        iconProps={{
          name: 'filter',
          color: 'foreground',
          size: 'small',
        }}
      >
        Columns
      </ButtonTrigger>
      <Popover.Content
        side='bottom'
        align='end'
        size='medium'
        inPortal={false} // Without this, the popover content cannot be scrolled correctly
        scrollable
        className='gap-y-2'
      >
        <Text.H5>Column selection</Text.H5>
        <Text.H6 color='foregroundMuted'>
          Customize the columns to be downloaded
        </Text.H6>
        <div className='flex flex-col mt-2'>
          {columns.map((column) => (
            <div
              key={column.name}
              className={cn(
                'w-full cursor-pointer select-none py-2 flex gap-x-4 items-center transition-opacity pl-2 rounded-md hover:bg-muted',
                !isColumnSelected(column) && 'opacity-60',
              )}
              onClick={() => onSelectColumn(column)}
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
