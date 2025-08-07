'use client'
import { useMemo, useState } from 'react'
import {
  DisambiguatedFilePath,
  disambiguateFilePaths,
} from '../../../lib/disambiguateFilePaths'
import { Button } from '../../atoms/Button'
import { Icon } from '../../atoms/Icons'
import { Input } from '../../atoms/Input'
import { Popover } from '../../atoms/Popover'
import { Text } from '../../atoms/Text'
import { Tooltip } from '../../atoms/Tooltip'

// TODO: Deprecate this component in favor of MultiSelect
export function FilePathSelector({
  filepaths,
  selected,
  onSelect,
  label,
  notFoundMessage = 'No files found',
  disabled,
}: {
  filepaths: string[]
  selected: string[]
  onSelect: (selected: string) => void
  label: string
  notFoundMessage?: string
  disabled?: boolean
}) {
  const [filter, setFilter] = useState<string>('')
  const filteredList = useMemo(
    () => filepaths.filter((element) => element.includes(filter)),
    [filepaths, filter],
  )

  const disambiguatedPaths = useMemo(
    () => disambiguateFilePaths(filteredList),
    [filteredList],
  )

  return (
    <Popover.Root onOpenChange={() => setFilter('')}>
      <Popover.Trigger asChild>
        <Button
          variant='outline'
          className='w-[200px] justify-start overflow-hidden'
          disabled={disabled}
        >
          <Text.H5 color='foregroundMuted' noWrap ellipsis>
            {label}
          </Text.H5>
        </Button>
      </Popover.Trigger>
      <Popover.Content>
        <div className='flex flex-col gap-2'>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder='Search'
          />
          <div className='flex flex-col gap-1 max-h-[300px] overflow-y-auto custom-scrollbar'>
            {disambiguatedPaths.map(
              (disambiguatedPath: DisambiguatedFilePath) => {
                const isSelected = selected.includes(disambiguatedPath.path)
                return (
                  <Tooltip
                    align='center'
                    side='left'
                    key={disambiguatedPath.path}
                    trigger={
                      <Button
                        key={disambiguatedPath.path}
                        variant='ghost'
                        onClick={() => onSelect(disambiguatedPath.path)}
                        className='px-2 relative max-w-full overflow-hidden hover:bg-muted'
                        fullWidth
                      >
                        <div className='flex flex-row gap-2 w-full justify-start max-w-full'>
                          <div className='min-w-4 flex items-center'>
                            {isSelected && (
                              <Icon
                                name='checkClean'
                                color='accentForeground'
                              />
                            )}
                          </div>
                          <div className='flex gap-2'>
                            <Text.H6
                              noWrap
                              ellipsis
                              color={
                                isSelected ? 'accentForeground' : 'foreground'
                              }
                            >
                              {disambiguatedPath.name}
                            </Text.H6>
                            {disambiguatedPath.context && (
                              <Text.H6 color='foregroundMuted' noWrap ellipsis>
                                {disambiguatedPath.context}
                              </Text.H6>
                            )}
                          </div>
                        </div>
                      </Button>
                    }
                  >
                    <Text.H6 color='background'>
                      {disambiguatedPath.path}
                    </Text.H6>
                  </Tooltip>
                )
              },
            )}
            {filteredList.length === 0 && (
              <Text.H5 color='foregroundMuted'>{notFoundMessage}</Text.H5>
            )}
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
