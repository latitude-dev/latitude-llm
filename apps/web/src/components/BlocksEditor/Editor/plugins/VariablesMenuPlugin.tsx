import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { $insertNodes, LexicalEditor, TextNode } from 'lexical'
import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { $getStepNames } from '../nodes/StepBlock'
import { $getVariableNames, VariableNode } from '../nodes/VariableNode'

class ComponentPickerOption extends MenuOption {
  label: string
  value: string
  icon?: IconName

  constructor({
    label,
    value,
    icon,
  }: {
    label: string
    value: string
    icon?: IconName
  }) {
    super(label)
    this.label = label
    this.value = value
    this.icon = icon
  }
}

interface ComponentPickerMenuItemProps {
  index: number
  isSelected: boolean
  onClick: () => void
  onMouseEnter: () => void
  option: ComponentPickerOption
}

function ComponentPickerMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: ComponentPickerMenuItemProps) {
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
        {option.label}
      </Text.H5>
    </li>
  )
}

export function getAllVariables(editor: LexicalEditor): string[] {
  let variables: string[] = []
  editor.getEditorState().read(() => {
    variables = Array.from(
      new Set([...$getVariableNames(), ...$getStepNames()]),
    )
  })
  return variables
}

function getVariableOptions(editor: LexicalEditor): ComponentPickerOption[] {
  return getAllVariables(editor).map((variable) => {
    return new ComponentPickerOption({ label: variable, value: variable })
  })
}

export function VariableMenuPlugin(): React.JSX.Element {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = useState<string | null>(null)
  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('{{', {
    allowWhitespace: true,
    minLength: 0,
  })

  const allVariables = getVariableOptions(editor)
  const filteredOptions = queryString
    ? allVariables.filter((option) =>
        option.label.toLowerCase().includes(queryString.toLowerCase()),
      )
    : allVariables

  const [options, setOptions] =
    useState<ComponentPickerOption[]>(filteredOptions)

  useEffect(() => {
    const allVariables = getVariableOptions(editor)
    const filteredOptions = queryString
      ? allVariables.filter((option) =>
          option.label.toLowerCase().includes(queryString.toLowerCase()),
        )
      : allVariables
    setOptions([
      ...filteredOptions,
      new ComponentPickerOption({
        label: 'Insert Variable',
        value: 'my_variable',
        icon: 'plus',
      }),
    ])
  }, [queryString, editor])

  const onSelectOption = useCallback(
    (
      selectedOption: ComponentPickerOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
      _matchingString: string,
    ) => {
      editor.update(() => {
        // Remove the trigger text node (contains '{{' and any typed text)
        nodeToRemove?.remove()

        const variableNode = new VariableNode(selectedOption.value)
        const spaceNode = new TextNode(' ')
        $insertNodes([variableNode, spaceNode])

        closeMenu()
      })
    },
    [editor],
  )
  const onTrigger = useCallback(
    (text: string, freshEditor: LexicalEditor) => {
      const triggerMatch = checkForTriggerMatch(text, freshEditor)
      if (!triggerMatch) return null

      return triggerMatch
    },
    [checkForTriggerMatch],
  )

  return (
    <LexicalTypeaheadMenuPlugin<ComponentPickerOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={onTrigger}
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) => {
        if (!anchorElementRef.current) return null
        if (!options.length) return null

        return createPortal(
          <div
            className={cn(
              'min-w-[200px] w-max max-w-[400px] max-h-[250px]',
              'overflow-x-hidden overflow-y-auto custom-scrollbar',
              'rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
              'z-50 animate-in fade-in-0 zoom-in-95',
            )}
          >
            <ul>
              {options.map((option: ComponentPickerOption, i: number) => (
                <ComponentPickerMenuItem
                  index={i}
                  isSelected={selectedIndex === i}
                  onClick={() => {
                    setHighlightedIndex(i)
                    selectOptionAndCleanUp(option)
                  }}
                  onMouseEnter={() => {
                    setHighlightedIndex(i)
                  }}
                  key={option.key}
                  option={option}
                />
              ))}
            </ul>
          </div>,
          anchorElementRef.current,
        )
      }}
    />
  )
}
