import { formatCount } from '$/lib/formatCount'
import {
  LogSources,
  RUN_SOURCES,
  RunSourceGroup,
} from '@latitude-data/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import {
  TabSelect,
  TabSelectOption,
} from '@latitude-data/web-ui/molecules/TabSelect'
import {
  BackgroundColor,
  colors,
  TextColor,
} from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback, useMemo } from 'react'

const SOURCE_OPTIONS: Record<
  RunSourceGroup,
  {
    label: string
    icon: IconName
    backgroundColor: BackgroundColor
    foregroundColor: TextColor
  }
> = {
  [RunSourceGroup.Production]: {
    label: 'Production',
    icon: 'radio',
    backgroundColor: 'warningMuted',
    foregroundColor: 'warningMutedForeground',
  },
  [RunSourceGroup.Playground]: {
    label: 'Playground',
    icon: 'lab',
    backgroundColor: 'accent',
    foregroundColor: 'accentForeground',
  },
} as const

export function RunSourceSelector({
  value,
  setValue,
  countBySource,
}: {
  value: RunSourceGroup
  setValue: (value: RunSourceGroup) => void
  countBySource?: Record<LogSources, number>
}) {
  const onChange = useCallback(
    (newValue: RunSourceGroup) => {
      if (value === newValue) return
      setValue(newValue)
    },
    [setValue, value],
  )

  const options = useMemo<TabSelectOption<RunSourceGroup>[]>(
    () =>
      Object.entries(SOURCE_OPTIONS).map(
        ([group, { label, icon, backgroundColor, foregroundColor }]) => {
          const count = Object.entries(countBySource ?? {})
            .filter(([source]) =>
              RUN_SOURCES[group as RunSourceGroup].includes(
                source as LogSources,
              ),
            )
            .reduce((acc, [_, count]) => acc + count, 0)

          const selected = value === (group as RunSourceGroup)

          return {
            value: group as RunSourceGroup,
            label,
            icon: (
              <div
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full',
                  {
                    [colors.backgrounds[backgroundColor]]: selected,
                  },
                )}
              >
                <Icon
                  name={icon}
                  color={selected ? foregroundColor : 'foregroundMuted'}
                />
              </div>
            ),
            suffix:
              count > 0 ? (
                <Badge shape='rounded' variant='noBorderMuted' ellipsis noWrap>
                  <div className='flex items-center justify-center gap-1'>
                    <Icon
                      name='loader'
                      color='foregroundMuted'
                      size='small'
                      className='animate-spin'
                    />
                    {formatCount(count)}
                  </div>
                </Badge>
              ) : undefined,
          }
        },
      ),
    [countBySource, value],
  )

  return (
    <TabSelect
      value={value}
      name='source'
      options={options}
      onChange={onChange}
    />
  )
}
