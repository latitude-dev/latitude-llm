import { type JSX, type ReactNode, useCallback, useState } from 'react'
import { Skeleton } from '../../atoms/Skeleton'
import { cn } from '../../../lib/utils'
import { Icon, type IconName } from '../../atoms/Icons'
import { Text } from '../../atoms/Text'
import { Command, CommandEmpty, CommandItem, CommandList } from '../../atoms/Command'
import { Button } from '../../atoms/Button'
import { DotIndicator } from '../../atoms/DotIndicator'

function LoadingOptionSkeleton() {
  return (
    <div className='flex flex-col gap-1 p-4 border-b border-border'>
      <Skeleton height='h6' className='w-40' />
      <div className='flex gap-2'>
        <Skeleton height='h6' className='w-8' />
        <Skeleton height='h6' className='w-20' />
      </div>
    </div>
  )
}

const LOADING_BLOCKS = Array.from({ length: 20 })

function LoadingSelectorSkeleton() {
  return LOADING_BLOCKS.map((_, i) => <LoadingOptionSkeleton key={i} />)
}

export type TwoColumnSelectOption<V = unknown> = {
  value: V
  name: string
  label: string
  icon?: IconName | JSX.Element
  isActive?: boolean
}

function OptionItem<V = unknown>({
  name,
  label,
  icon,
  onSelect,
  isSelected,
  isActive = false,
  disabled = false,
}: TwoColumnSelectOption<V> & {
  isSelected: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <CommandItem
      unstyled
      autoFocus
      disabled={disabled}
      className={cn(
        'flex flex-col gap-1 p-4 cursor-pointer rounded-sm',
        'hover:ring-offset-primary hover:ring-1',
        'focus:ring-offset-primary focus:ring-1',
        {
          'bg-muted/60 hover:bg-muted': !isSelected,
          'bg-accent': isSelected,
        },
      )}
      onSelect={onSelect}
    >
      <div className='flex flex-row items-center gap-2 min-w-0'>
        {isActive ? (
          <div className='flex min-w-4 justify-center'>
            <DotIndicator pulse variant='success' />
          </div>
        ) : null}
        <Text.H5B color='foreground' ellipsis noWrap>
          {name}
        </Text.H5B>
      </div>
      <div className='flex flex-row items-center gap-2 min-w-0'>
        {typeof icon === 'string' ? (
          <Icon className='flex-none' name={icon} color='foregroundMuted' />
        ) : (
          icon
        )}
        <Text.H6 ellipsis noWrap color='foregroundMuted'>
          {label}
        </Text.H6>
      </div>
    </CommandItem>
  )
}

type AddNewProps = {
  onAddNew: () => void
  addNewLabel: string
}
function AddNewItem({
  onAddNew,
  addNewLabel,
  disabled = false,
}: AddNewProps & { disabled?: boolean }) {
  return (
    <Button
      onClick={onAddNew}
      disabled={disabled}
      variant='outline'
      iconProps={{ name: 'addSquare', color: 'foregroundMuted' }}
    >
      {addNewLabel}
    </Button>
  )
}

export function TwoColumnSelect<V = unknown>({
  options,
  loading = false,
  disabled = false,
  addNew,
  onChange,
  value,
  defaultValue,
  children,
  emptySlateLabel = 'No options available',
}: {
  options: TwoColumnSelectOption<V>[]
  loading?: boolean
  addNew?: AddNewProps
  value?: V
  defaultValue?: V
  disabled?: boolean
  onChange?: (value: V) => void
  children?: ReactNode
  emptySlateLabel?: string
}) {
  const [selectedValue, setSelected] = useState<V | undefined>(value ?? defaultValue)
  const onSelect = useCallback(
    (newValue: V) => () => {
      setSelected(newValue as V)
      if (onChange) {
        onChange(newValue as V)
      }
    },
    [onChange],
  )

  const twoColumns = loading || options.length > 0
  return (
    <div
      className={cn('grid w-full h-full max-h-full overflow-hidden relative', {
        'grid-cols-2': twoColumns,
      })}
    >
      <div
        className={cn('flex flex-col', {
          'overflow-y-auto custom-scrollbar': !loading,
          'border-r border-border': twoColumns,
        })}
      >
        {loading ? (
          <LoadingSelectorSkeleton />
        ) : (
          <>
            <Command unstyled autoFocus>
              <CommandList autoFocus maxHeight='auto'>
                <div className='flex flex-col gap-y-1 mb-1 pl-1 pr-1 pt-1'>
                  {options.map((option, i) => (
                    <OptionItem
                      key={i}
                      disabled={disabled}
                      name={option.name}
                      value={option.value}
                      label={option.label}
                      icon={option.icon}
                      isActive={option.isActive}
                      isSelected={option.value === selectedValue}
                      onSelect={onSelect(option.value)}
                    />
                  ))}
                  <CommandEmpty>
                    <Text.H6>{emptySlateLabel}</Text.H6>
                  </CommandEmpty>
                </div>
              </CommandList>
            </Command>
            {addNew ? (
              <div className='flex flex-col border-border border-t p-2'>
                <AddNewItem onAddNew={addNew.onAddNew} addNewLabel={addNew.addNewLabel} />
              </div>
            ) : null}
          </>
        )}
      </div>
      {options.length > 0 ? (
        <div className='flex flex-col w-full overflow-auto custom-scrollbar relative bg-backgroundCode'>
          {children}
        </div>
      ) : null}
    </div>
  )
}
