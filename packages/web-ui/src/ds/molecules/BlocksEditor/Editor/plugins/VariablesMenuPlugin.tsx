import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { $insertNodes, LexicalEditor, TextNode } from 'lexical'
import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../../../../lib/utils'
import { Text } from '../../../../atoms/Text'
import { $getStepNames } from '../nodes/StepBlock'
import { $getVariableNames, VariableNode } from '../nodes/VariableNode'

class ComponentPickerOption extends MenuOption {
  name: string
  constructor({ name }: { name: string }) {
    super(name)
    this.name = name
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
        'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
        'gap-2 items-start cursor-pointer',
        {
          'bg-muted': isSelected,
        },
      )}
      ref={option.setRefElement}
      role='option'
      aria-selected={isSelected}
      id={`typeahead-item-${index}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <Text.H5>{option.name}</Text.H5>
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
    return new ComponentPickerOption({ name: variable })
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
        option.name.toLowerCase().includes(queryString.toLowerCase()),
      )
    : allVariables

  const [options, setOptions] =
    useState<ComponentPickerOption[]>(filteredOptions)

  useEffect(() => {
    const allVariables = getVariableOptions(editor)
    const filteredOptions = queryString
      ? allVariables.filter((option) =>
          option.name.toLowerCase().includes(queryString.toLowerCase()),
        )
      : allVariables
    setOptions(filteredOptions)
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

        const variableNode = new VariableNode(selectedOption.name)
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
              'min-w-[200px] w-max max-w-[300px] overflow-hidden rounded-md border ',
              'bg-backgroundCode text-popover-foreground shadow-md',
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
