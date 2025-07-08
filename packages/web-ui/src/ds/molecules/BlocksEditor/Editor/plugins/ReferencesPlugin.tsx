import React, { useCallback, useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $insertNodes, TextNode, LexicalEditor } from 'lexical'
import { cn } from '../../../../../lib/utils'
import { Text } from '../../../../atoms/Text'
import { ReferenceNode } from '../nodes/ReferenceNode'
import { BlocksEditorProps, IncludedPrompt } from '../../types'
import { Icon } from '../../../../atoms/Icons'
import { ConversationMetadata } from 'promptl-ai'

export function buildReferencePath(path: string): string {
  return `/${path}`
}

class ReferencePickerOption extends MenuOption {
  label: string
  path: string
  prompt: IncludedPrompt

  constructor(path: string, prompt: IncludedPrompt) {
    super(path)
    this.label = path
    this.path = buildReferencePath(path)
    this.prompt = prompt
  }
}

interface ReferencePickerMenuItemProps {
  index: number
  isSelected: boolean
  onClick: () => void
  onMouseEnter: () => void
  option: ReferencePickerOption
}

const CUSTOM_EVENTS = {
  GO_TO_DEV_EDITOR: 'goToDevEditor',
} as const

export function EventListeners({
  onToggleDevEditor,
}: {
  onToggleDevEditor: BlocksEditorProps['onToggleDevEditor']
}) {
  useEffect(() => {
    const abortController = new AbortController()
    const handleGoToDevEditor = () => {
      onToggleDevEditor()
    }

    document.addEventListener(
      CUSTOM_EVENTS.GO_TO_DEV_EDITOR,
      handleGoToDevEditor,
      { signal: abortController.signal },
    )

    return () => {
      abortController.abort()
      document.removeEventListener(
        CUSTOM_EVENTS.GO_TO_DEV_EDITOR,
        handleGoToDevEditor,
      )
    }
  }, [onToggleDevEditor])

  return null
}

function ReferencePickerMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: ReferencePickerMenuItemProps) {
  return (
    <li
      key={option.key}
      tabIndex={-1}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
        'gap-x-1 items-center cursor-pointer',
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
      <Icon name='file' color='foregroundMuted' />
      <Text.H5 noWrap ellipsis>
        {option.label}
      </Text.H5>
    </li>
  )
}

function buildEmptyAttributes(metadata: ConversationMetadata) {
  return Object.fromEntries(
    Array.from(metadata.parameters).map((key) => [key, undefined]),
  )
}

export function ReferencesPlugin({
  prompts,
  onRequestPromptMetadata,
  onToggleDevEditor,
}: {
  prompts: Record<string, IncludedPrompt>
  onRequestPromptMetadata: BlocksEditorProps['onRequestPromptMetadata']
  onToggleDevEditor: BlocksEditorProps['onToggleDevEditor']
}): React.JSX.Element {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = useState<string | null>(null)
  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('@', {
    allowWhitespace: false,
    minLength: 0,
  })

  const allOptions = useMemo(
    () =>
      Object.entries(prompts).map(
        ([path, prompt]) => new ReferencePickerOption(path, prompt),
      ),
    [prompts],
  )

  const [options, setOptions] = useState<ReferencePickerOption[]>(allOptions)

  const onSelectOption = useCallback(
    async (
      selectedOption: ReferencePickerOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
      _matchingString: string,
    ) => {
      let referenceNode: ReferenceNode

      editor.update(() => {
        nodeToRemove?.remove()

        referenceNode = new ReferenceNode({
          path: selectedOption.path,
          attributes: {},
          isLoading: true,
        })
        $insertNodes([referenceNode, new TextNode(' ')])

        closeMenu()
      })

      const metadata = await onRequestPromptMetadata(selectedOption.prompt)
      editor.update(() => {
        const attrs = buildEmptyAttributes(metadata)
        referenceNode.updateAttributes(attrs)
      })
    },
    [editor, onRequestPromptMetadata],
  )

  const onTrigger = useCallback(
    (text: string, freshEditor: LexicalEditor) => {
      const triggerMatch = checkForTriggerMatch(text, freshEditor)

      if (!triggerMatch) return null

      const filteredOptions = queryString
        ? allOptions.filter((option) =>
            option.path.toLowerCase().includes(queryString.toLowerCase()),
          )
        : allOptions

      setOptions(filteredOptions)

      return triggerMatch
    },
    [checkForTriggerMatch, queryString, allOptions],
  )

  return (
    <>
      <EventListeners onToggleDevEditor={onToggleDevEditor} />
      <LexicalTypeaheadMenuPlugin<ReferencePickerOption>
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
                'min-w-[200px] w-max max-w-[400px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
                'z-50 animate-in fade-in-0 zoom-in-95',
              )}
            >
              <ul>
                {options.map((option: ReferencePickerOption, i: number) => (
                  <ReferencePickerMenuItem
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
    </>
  )
}

export function triggerToggleDevEditor() {
  const event = new CustomEvent(CUSTOM_EVENTS.GO_TO_DEV_EDITOR)
  document.dispatchEvent(event)
}
