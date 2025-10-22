import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { ComponentPickerOption, PickerGroup } from '../useGroupedOptions'

export function flattenGroups(groups: PickerGroup[]): ComponentPickerOption[] {
  return groups.flatMap((g) => g.options)
}

export function filterGroups(
  groups: PickerGroup[],
  query: string | null,
): PickerGroup[] {
  if (!query) return groups
  const regex = new RegExp(query, 'i')
  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) =>
          regex.test(option.title) ||
          option.keywords.some((k) => regex.test(k)),
      ),
    }))
    .filter((group) => group.options.length > 0)
}

export function ComponentPickerMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number
  isSelected: boolean
  onClick: () => void
  onMouseEnter: () => void
  option: ComponentPickerOption
}) {
  return (
    <li
      key={option.key}
      tabIndex={-1}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-base outline-none transition-colors',
        'gap-x-2 cursor-pointer',
        {
          'bg-accent': isSelected,
        },
      )}
      ref={option.setRefElement}
      role='option'
      aria-selected={isSelected}
      id={`typeahead-item-${index}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {!!option.icon && <Icon name={option.icon} color='foregroundMuted' />}
      <Text.H5
        color={isSelected ? 'accentForeground' : 'foregroundMuted'}
        noWrap
        ellipsis
      >
        {option.title}
      </Text.H5>
      {!!option.hotkey && (
        <span className='flex-1 flex justify-end items-center'>
          <Text.H6B color='foregroundMuted' monospace>
            {option.hotkey}
          </Text.H6B>
        </span>
      )}
    </li>
  )
}
