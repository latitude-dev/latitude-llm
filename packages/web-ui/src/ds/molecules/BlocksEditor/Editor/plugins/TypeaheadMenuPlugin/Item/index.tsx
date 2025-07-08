import { cn } from '../../../../../../../lib/utils'
import { Icon } from '../../../../../../atoms/Icons'
import { Text } from '../../../../../../atoms/Text'
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
        'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
        'gap-x-2 items-start cursor-pointer',
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
      {option.icon ? <Icon name={option.icon} color='foregroundMuted' /> : null}
      <Text.H5 color={isSelected ? 'accentForeground' : 'foregroundMuted'}>
        {option.title}
      </Text.H5>
    </li>
  )
}
