import React, { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  BaseSelection,
  ElementNode,
  LexicalEditor,
  TextNode,
} from 'lexical'
import { cn } from '../../../../../lib/utils'
import { Text } from '../../../../atoms/Text'
import {
  $createMessageBlockNode,
  $createStepBlockNode,
  $isMessageBlockNode,
  $isStepBlockNode,
} from '../nodes/utils'

interface MenuItemOption {
  key: string
  keywords: string[]
  emoji: string
  onSelect: () => void
}

class ComponentPickerOption extends MenuOption {
  title: string
  keywords: string[]
  emoji: string
  onSelect: (queryString: string) => void

  constructor(title: string, options: MenuItemOption) {
    super(title)
    this.title = title
    this.key = options.key
    this.keywords = options.keywords
    this.emoji = options.emoji
    this.onSelect = options.onSelect.bind(this)
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
      <span className='text-lg'>{option.emoji}</span>
      <div className='w-full'>
        <Text.H5>{option.title}</Text.H5>
      </div>
    </li>
  )
}

const DEFAULT_COMMAND_CONTEXT = {
  isInsideStepBlock: false,
  isInsideMessageBlock: false,
}

function getContext({ selection }: { selection: BaseSelection | null }) {
  if (!selection) return DEFAULT_COMMAND_CONTEXT
  if (!$isRangeSelection(selection)) return DEFAULT_COMMAND_CONTEXT

  const anchorNode = selection.anchor.getNode()
  let currentNode: ElementNode | TextNode | null = anchorNode

  // Track what we've found as we walk up
  let isInsideStepBlock = false
  let isInsideMessageBlock = false

  while (currentNode) {
    if ($isStepBlockNode(currentNode)) {
      isInsideStepBlock = true
      break
    }

    if ($isMessageBlockNode(currentNode)) {
      isInsideMessageBlock = true
      break
    }

    currentNode = currentNode.getParent()
  }

  return {
    isInsideStepBlock,
    isInsideMessageBlock,
  }
}

function getAllOptions(editor: LexicalEditor): ComponentPickerOption[] {
  return [
    // Step option
    new ComponentPickerOption('Step', {
      key: 'step',
      emoji: '📋',
      keywords: ['step', 'block', 'section'],
      onSelect: () =>
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            const stepBlock = $createStepBlockNode('Step')
            selection.insertNodes([stepBlock])
          }
        }),
    }),

    // Message options
    new ComponentPickerOption('System Message', {
      key: 'message_system',
      emoji: '🔧',
      keywords: ['system', 'message', 'prompt'],
      onSelect: () =>
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            const messageBlock = $createMessageBlockNode('system')
            selection.insertNodes([messageBlock])
          }
        }),
    }),
    new ComponentPickerOption('User Message', {
      key: 'message_user',
      emoji: '👤',
      keywords: ['user', 'message', 'input'],
      onSelect: () =>
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            const messageBlock = $createMessageBlockNode('user')
            selection.insertNodes([messageBlock])
          }
        }),
    }),
    new ComponentPickerOption('Assistant Message', {
      key: 'message_assistant',
      emoji: '🤖',
      keywords: ['assistant', 'message', 'ai', 'response'],
      onSelect: () =>
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            const messageBlock = $createMessageBlockNode('assistant')
            selection.insertNodes([messageBlock])
          }
        }),
    }),
    new ComponentPickerOption('Developer Message', {
      key: 'message_developer',
      emoji: '👨‍💻',
      keywords: ['developer', 'message', 'dev', 'debug'],
      onSelect: () =>
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            const messageBlock = $createMessageBlockNode('developer')
            selection.insertNodes([messageBlock])
          }
        }),
    }),
  ]
}

export function TypeaheadMenuPlugin(): React.JSX.Element {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = useState<string | null>(null)

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('/', {
    allowWhitespace: true,
    minLength: 0,
  })
  const allOptions = useMemo(() => getAllOptions(editor), [editor])
  const [options, setOptions] = useState<ComponentPickerOption[]>(allOptions)

  const onSelectOption = useCallback(
    (
      selectedOption: ComponentPickerOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
      matchingString: string,
    ) => {
      editor.update(() => {
        nodeToRemove?.remove()
        selectedOption.onSelect(matchingString)
        closeMenu()
      })
    },
    [editor],
  )
  const onTrigger = useCallback(
    (text: string, freshEditor: LexicalEditor) => {
      function filterOptions() {
        let context = DEFAULT_COMMAND_CONTEXT
        freshEditor.getEditorState().read(() => {
          context = getContext({ selection: $getSelection() })
        })
        const { isInsideStepBlock, isInsideMessageBlock } = context
        let baseOptions = allOptions.filter((option) => {
          if (option.key === 'step') {
            const shouldShow = !isInsideStepBlock && !isInsideMessageBlock
            return shouldShow
          }

          if (option.key.startsWith('message_')) {
            const shouldShow = !isInsideMessageBlock
            return shouldShow
          }

          return true
        })

        if (!queryString) return baseOptions

        const regex = new RegExp(queryString, 'i')

        return baseOptions.filter(
          (option: ComponentPickerOption) =>
            regex.test(option.title) ||
            option.keywords.some((keyword: string) => regex.test(keyword)),
        )
      }

      setOptions(filterOptions())
      return checkForTriggerMatch(text, freshEditor)
    },
    [checkForTriggerMatch, queryString, allOptions],
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
              'min-w-[200px] w-max max-w-[300px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
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
