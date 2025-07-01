import { useCallback, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'

import { cn } from '../../../../lib/utils'
import { font } from '../../../tokens'
import { BlocksEditorProps } from '../types'
import { BlocksEditorProvider } from './Provider'

import { fromBlocksToLexical } from './state/fromBlocksToLexical'
import { fromLexicalToText } from './state/fromLexicalToText'

import { HierarchyValidationPlugin } from './plugins/HierarchyValidationPlugin'
import { EnterKeyPlugin } from './plugins/EnterKeyPlugin'
import { DraggableBlockPlugin } from './plugins/DraggableBlockPlugin'
import { StepNameEditPlugin } from './plugins/StepNameEditPlugin'
import { TypeaheadMenuPlugin } from './plugins/TypeaheadMenuPlugin'
import { MessageBlockNode } from './nodes/MessageBlock'
import { StepBlockNode } from './nodes/StepBlock'
import { VERTICAL_SPACE_CLASS } from './nodes/utils'
import { InsertEmptyLinePlugin } from './plugins/InsertEmptyLinePlugin'
import { VariableTransformPlugin } from './plugins/VariableTransformPlugin'
import { VariableNode } from './nodes/VariableNode'
import { VariableMenuPlugin } from './plugins/VariablesMenuPlugin'
import { ReferencesPlugin } from './plugins/ReferencesPlugin'
import { ReferenceNode } from './nodes/ReferenceNode'

const theme = {
  ltr: 'ltr',
  rtl: 'rtl',
  paragraph: cn('block-paragraph align-middle', font.size.h5),
  text: {
    bold: 'font-bold',
    italic: 'italic',
    strikethrough: 'line-through',
    subscript: 'text-xs align-sub',
    superscript: 'text-xs align-super',
    underline: 'underline',
    underlineStrikethrough: 'underline line-through',
  },
}

function OnChangeHandler({
  onChange,
}: {
  onChange: BlocksEditorProps['onChange']
}) {
  // TODO: review the storing strategy.
  // Now we do this debounce of 100 and there is another debounce of 500
  // in the playground before saving the text. But maybe there is a better way.
  const handleChange = useDebouncedCallback(
    fromLexicalToText({ onChange }),
    500,
    { trailing: true },
  )

  return (
    <OnChangePlugin
      onChange={handleChange}
      ignoreHistoryMergeTagChange
      ignoreSelectionChange
    />
  )
}

export function BlocksEditor({
  currentDocument,
  placeholder = 'Start typing...',
  rootBlock,
  onChange,
  onError,
  className,
  prompts,
  onRequestPromptMetadata,
  onToggleDevEditor,
  Link,
  readOnly = false,
  autoFocus = false,
}: BlocksEditorProps) {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null)

  const onRef = useCallback((floatingAnchorElem: HTMLDivElement) => {
    if (floatingAnchorElem !== null) {
      setFloatingAnchorElem(floatingAnchorElem)
    }
  }, [])
  const initialConfig = useMemo(
    () => ({
      namespace: 'BlocksEditor',
      theme,
      editorState: fromBlocksToLexical(rootBlock),
      onError,
      editable: !readOnly,
      nodes: [MessageBlockNode, StepBlockNode, VariableNode, ReferenceNode],
    }),
    [rootBlock, readOnly, onError],
  )

  return (
    <BlocksEditorProvider
      currentDocument={currentDocument}
      Link={Link}
      prompts={prompts}
    >
      <div
        className={cn(
          'relative border border-gray-200 rounded-lg bg-white',
          'focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500',
          className,
        )}
      >
        <LexicalComposer initialConfig={initialConfig}>
          <div className='relative' ref={onRef}>
            <RichTextPlugin
              ErrorBoundary={LexicalErrorBoundary}
              contentEditable={
                <ContentEditable
                  className={cn(
                    'min-h-[300px] py-4 [&_>*]:px-4 outline-none resize-none text-sm leading-relaxed',
                    'focus:outline-none',
                    VERTICAL_SPACE_CLASS,
                    {
                      'cursor-default': readOnly,
                    },
                  )}
                  aria-placeholder={placeholder}
                  placeholder={
                    <div className='absolute top-4 left-4 text-gray-400 pointer-events-none select-none'>
                      {placeholder}
                    </div>
                  }
                />
              }
            />

            <HistoryPlugin />
            <EnterKeyPlugin />
            <InsertEmptyLinePlugin />
            <StepNameEditPlugin />
            <TypeaheadMenuPlugin />
            <VariableMenuPlugin />
            <ReferencesPlugin
              prompts={prompts}
              onRequestPromptMetadata={onRequestPromptMetadata}
              onToggleDevEditor={onToggleDevEditor}
            />
            <HierarchyValidationPlugin />
            <VariableTransformPlugin />

            {!readOnly && floatingAnchorElem && (
              <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
            )}

            {autoFocus && <AutoFocusPlugin />}

            <OnChangeHandler onChange={onChange} />
          </div>
        </LexicalComposer>
      </div>
    </BlocksEditorProvider>
  )
}
