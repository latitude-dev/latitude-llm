import { useCallback, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import {
  InitialConfigType,
  LexicalComposer,
} from '@lexical/react/LexicalComposer'
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
import { Text } from '../../../atoms/Text'

import { fromBlocksToLexical } from './state/fromBlocksToLexical'
import { fromLexicalToText } from './state/fromLexicalToText'

import { HierarchyValidationPlugin } from './plugins/HierarchyValidationPlugin'
import { EnterKeyPlugin } from './plugins/EnterKeyPlugin'
import { DraggableBlockPlugin } from './plugins/DraggableBlockPlugin'
import { StepEditPlugin } from './plugins/StepEditPlugin'
import { TypeaheadMenuPlugin } from './plugins/TypeaheadMenuPlugin'
import { MessageBlockNode } from './nodes/MessageBlock'
import { StepBlockNode } from './nodes/StepBlock'
import { VERTICAL_SPACE_CLASS } from './nodes/utils'
import { VariableTransformPlugin } from './plugins/VariableTransformPlugin'
import { VariableNode } from './nodes/VariableNode'
import { VariableMenuPlugin } from './plugins/VariablesMenuPlugin'
import { ReferencesPlugin } from './plugins/ReferencesPlugin'
import { ReferenceEditPlugin } from './plugins/ReferenceEditPlugin'
import { ReferenceNode } from './nodes/ReferenceNode'
import { CodeNode } from './nodes/CodeNode'
import { PreventBackspaceEscapePlugin } from './plugins/PreventBackspaceEscapePlugin'
import { MessageEditPlugin } from './plugins/MessageEditPlugin'

const theme = {
  ltr: 'ltr',
  rtl: 'rtl',
  paragraph: cn('block-paragraph align-middle', font.size.h5),
  code: cn(
    'block whitespace-pre',
    'whitespace-pre',
    'text-sm text-muted-foreground',
    'px-4 py-2',
    'rounded-lg',
    'bg-backgroundCode',
    'border before:border-border/80',
  ),
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
  const handleChange = useDebouncedCallback(
    fromLexicalToText({ onChange }),
    100,
    { leading: false, trailing: true },
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
  initialValue,
  onChange,
  onError,
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
  const initialConfig = useMemo<InitialConfigType>(() => {
    return {
      namespace: 'BlocksEditor',
      theme,
      editorState: fromBlocksToLexical(initialValue),
      editable: !readOnly,
      onError,
      nodes: [
        CodeNode,
        MessageBlockNode,
        StepBlockNode,
        VariableNode,
        ReferenceNode,
      ],
    }
  }, [readOnly, onError, initialValue])

  return (
    <BlocksEditorProvider
      currentDocument={currentDocument}
      Link={Link}
      prompts={prompts}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <div className='relative' ref={onRef}>
          <RichTextPlugin
            ErrorBoundary={LexicalErrorBoundary}
            contentEditable={
              <ContentEditable
                className={cn(
                  'outline-none resize-none text-sm leading-relaxed',
                  'focus:outline-none',
                  VERTICAL_SPACE_CLASS,
                  {
                    'cursor-default': readOnly,
                  },
                )}
                aria-placeholder={placeholder}
                placeholder={
                  <div className='absolute top-0 text-gray-400 pointer-events-none select-none'>
                    <Text.H5 color='foregroundMuted' textOpacity={50}>
                      {placeholder}
                    </Text.H5>
                  </div>
                }
              />
            }
          />
          <EnterKeyPlugin />
          <PreventBackspaceEscapePlugin />
          <StepEditPlugin />
          <MessageEditPlugin />
          <TypeaheadMenuPlugin />
          <VariableMenuPlugin />
          <ReferencesPlugin
            prompts={prompts}
            onRequestPromptMetadata={onRequestPromptMetadata}
            onToggleDevEditor={onToggleDevEditor}
          />
          <ReferenceEditPlugin />
          <HierarchyValidationPlugin />
          <VariableTransformPlugin />
          <HistoryPlugin />

          {!readOnly && floatingAnchorElem && (
            <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
          )}

          {autoFocus && <AutoFocusPlugin />}

          <OnChangeHandler onChange={onChange} />
        </div>
      </LexicalComposer>
    </BlocksEditorProvider>
  )
}
