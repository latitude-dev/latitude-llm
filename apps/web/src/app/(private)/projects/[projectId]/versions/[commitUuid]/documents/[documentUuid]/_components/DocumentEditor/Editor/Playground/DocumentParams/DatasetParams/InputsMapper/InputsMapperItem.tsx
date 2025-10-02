import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { type UseSelectDataset } from '../useSelectDataset'
import { InputSource } from '@latitude-data/core/lib/documentPersistedInputs'

type SelectValueType = string
export type OnSelectRowCellFn<T> = (
  param: string,
) => (value: T | undefined) => void

export function InputsMapperItem({
  value,
  isMapped,
  param,
  rowCellOptions,
  onSelectRowCell,
  setSource,
  tooltipValue: inputTooltipValue,
  copyToManual,
  loadingState,
}: {
  value: SelectValueType | undefined
  loadingState: UseSelectDataset['loadingState']
  isMapped: boolean
  param: string
  onSelectRowCell: OnSelectRowCellFn<SelectValueType>
  rowCellOptions: SelectOption<SelectValueType>[]
  setSource: (source: InputSource) => void
  tooltipValue: { isEmpty: boolean; value: string }
  copyToManual: () => void
}) {
  const isLoading =
    loadingState.rows || loadingState.position || loadingState.isAssigning

  return (
    <div className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'>
      <div className='flex flex-row items-center gap-x-2 min-h-8'>
        <Badge variant={isMapped ? 'accent' : 'muted'}>
          &#123;&#123;{param}&#125;&#125;
        </Badge>
        {!isMapped ? (
          <Tooltip trigger={<Icon name='info' />}>
            This variable is not mapped to any row header
          </Tooltip>
        ) : null}
      </div>
      <div className='flex flex-grow min-w-0 items-start w-full'>
        <div className='flex flex-col flex-grow min-w-0 gap-y-1'>
          <Select<SelectValueType>
            name={param}
            placeholder='Choose row header'
            options={rowCellOptions}
            disabled={isLoading || rowCellOptions.length === 0}
            onChange={onSelectRowCell(param)}
            value={value}
          />
          <div className='flex flex-row items-center gap-x-2 flex-grow min-w-0'>
            <Text.H6 color='foregroundMuted' ellipsis noWrap>
              {isLoading ? 'Loading...' : inputTooltipValue.value}
            </Text.H6>
          </div>
        </div>
        <div className='min-h-8 flex flex-row items-center'>
          <Tooltip
            asChild
            trigger={
              <Button
                variant='ghost'
                disabled={isLoading || value === undefined || value === null}
                onClick={() => {
                  copyToManual()
                  setSource('manual')
                }}
                iconProps={{ name: 'pencil' }}
              />
            }
          >
            Edit the value
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
