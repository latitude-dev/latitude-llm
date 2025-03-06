import {
  Badge,
  Button,
  Icon,
  Select,
  SelectOption,
  Skeleton,
  Text,
  Tooltip,
} from '@latitude-data/web-ui'
import { DatasetVersion, InputSource } from '@latitude-data/core/browser'

type SelectValueType<V extends DatasetVersion> = V extends DatasetVersion.V1
  ? number
  : string
export type OnSelectRowCellFn<T> = (
  param: string,
) => (value: T | undefined) => void

export function InputsMapperItem<V extends DatasetVersion = DatasetVersion>({
  value,
  isLoading,
  disabled,
  isMapped,
  param,
  rowCellOptions,
  onSelectRowCell,
  setSource,
  tooltipValue: inputTooltipValue,
  copyToManual,
}: {
  datasetVersion: V
  value: SelectValueType<V> | undefined
  isLoading: boolean
  disabled: boolean
  isMapped: boolean
  param: string
  onSelectRowCell: OnSelectRowCellFn<SelectValueType<V>>
  rowCellOptions: SelectOption<SelectValueType<V>>[]
  setSource: (source: InputSource) => void
  tooltipValue: { isEmpty: boolean; value: string }
  copyToManual: () => void
}) {
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
          <Select<SelectValueType<V>>
            name='datasetId'
            placeholder={isLoading ? 'Loading...' : 'Choose row header'}
            disabled={disabled}
            options={rowCellOptions}
            onChange={onSelectRowCell(param)}
            value={value}
          />
          <div className='flex flex-row items-center gap-x-2 flex-grow min-w-0'>
            {isLoading ? (
              <Skeleton height='h6' className='w-40 min-w-0' />
            ) : (
              <Text.H6 color='foregroundMuted' ellipsis noWrap>
                {inputTooltipValue.value}
              </Text.H6>
            )}
          </div>
        </div>
        <div className='min-h-8 flex flex-row items-center'>
          <Tooltip
            asChild
            trigger={
              <Button
                variant='ghost'
                disabled={disabled || value === undefined || value === null}
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
