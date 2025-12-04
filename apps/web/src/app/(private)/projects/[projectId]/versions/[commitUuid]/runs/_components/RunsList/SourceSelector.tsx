import { RunSourceGroup } from '@latitude-data/constants'
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
}: {
  value: RunSourceGroup
  setValue: (value: RunSourceGroup) => void
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
          }
        },
      ),
    [value],
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
