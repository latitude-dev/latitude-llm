import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
  $getSelection,
  $isRangeSelection,
  BaseSelection,
  ElementNode,
  LexicalEditor,
  TextNode,
} from 'lexical'
import { JSX, useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { $isMessageBlockNode } from '../../nodes/MessageBlock'
import { $isStepBlockNode } from '../../nodes/StepBlock'
import { ComponentPickerMenuItem, filterGroups, flattenGroups } from './Item'
import {
  ComponentPickerOption,
  PickerGroup,
  useGroupedOptions,
} from './useGroupedOptions'

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

export function TypeaheadMenuPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = useState<string | null>(null)

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('/', {
    allowWhitespace: true,
    minLength: 0,
  })

  const { allGroups } = useGroupedOptions()
  const [groups, setGroups] = useState<PickerGroup[]>(allGroups)
  const flatOptions = useMemo(() => flattenGroups(groups), [groups])

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

        const baseOptions = allGroups.filter((option) => {
          if (option.key === 'steps') {
            const shouldShow = !isInsideStepBlock && !isInsideMessageBlock
            return shouldShow
          }

          if (option.key === 'messages') {
            const shouldShow = !isInsideMessageBlock
            return shouldShow
          }

          return true
        })

        if (!queryString) return baseOptions

        return filterGroups(baseOptions, queryString)
      }

      setGroups(filterOptions())
      return checkForTriggerMatch(text, freshEditor)
    },
    [checkForTriggerMatch, queryString, allGroups],
  )

  return (
    <LexicalTypeaheadMenuPlugin<ComponentPickerOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={onTrigger}
      options={flatOptions}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) => {
        if (!anchorElementRef.current || !flatOptions.length) return null
        let runningIdx = 0
        return createPortal(
          <div
            className={cn(
              'min-w-80 w-max max-w-[400px] max-h-[400px]',
              'overflow-x-hidden overflow-y-auto custom-scrollbar',
              'rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
              'z-50 animate-in fade-in-0 zoom-in-95',
            )}
          >
            <ul>
              {groups.map((group, gIdx) => (
                <li key={group.label ?? `group-${gIdx}`}>
                  {group.label && (
                    <div className='px-2 py-1 select-none bg-backgroundCode'>
                      <Text.H6M color='foregroundMuted'>{group.label}</Text.H6M>
                    </div>
                  )}
                  <ul className='p-1'>
                    {group.options.map((option) => {
                      const idx = runningIdx++
                      return (
                        <ComponentPickerMenuItem
                          index={idx}
                          isSelected={selectedIndex === idx}
                          onClick={() => {
                            setHighlightedIndex(idx)
                            selectOptionAndCleanUp(option)
                          }}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          key={option.key}
                          option={option}
                        />
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </div>,
          anchorElementRef.current,
        )
      }}
    />
  )
}
