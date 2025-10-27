import { Text } from '@latitude-data/web-ui/atoms/Text'
import { EditorReadOnlyBanner } from '@latitude-data/web-ui/molecules/DocumentTextEditor'
import { font } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
import {
  InitialConfigType,
  LexicalComposer,
} from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { useCallback, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { BlocksEditorProps } from '../types'
import { CodeNode } from './nodes/CodeNode'
import { FileNode } from './nodes/FileNode'
import { ImageNode } from './nodes/ImageNode'
import { MessageBlockNode } from './nodes/MessageBlock'
import { ReferenceNode } from './nodes/ReferenceNode'
import { StepBlockNode } from './nodes/StepBlock'
import { VERTICAL_SPACE_CLASS } from './nodes/utils'
import { VariableNode } from './nodes/VariableNode'
import { DraggableBlockPlugin } from './plugins/DraggableBlockPlugin'
import { EnterKeyPlugin } from './plugins/EnterKeyPlugin'
import { HierarchyValidationPlugin } from './plugins/HierarchyValidationPlugin'
import { MessageEditPlugin } from './plugins/MessageEditPlugin'
import { PreventBackspaceEscapePlugin } from './plugins/PreventBackspaceEscapePlugin'
import { ReferenceEditPlugin } from './plugins/ReferenceEditPlugin'
import { ReferencesPlugin } from './plugins/ReferencesPlugin'
import { StepEditPlugin } from './plugins/StepEditPlugin'
import { SyncChangesPlugin } from './plugins/SyncChangesPlugin'
import { TypeaheadMenuPlugin } from './plugins/TypeaheadMenuPlugin'
import { VariableEditPlugin } from './plugins/VariableEditPlugin'
import { VariableMenuPlugin } from './plugins/VariablesMenuPlugin'
import { VariableTransformPlugin } from './plugins/VariableTransformPlugin'
import { BlocksEditorProvider } from './Provider'
import { fromBlocksToLexical } from './state/fromBlocksToLexical'
import { fromLexicalToText } from './state/fromLexicalToText'

const theme = {
  ltr: 'ltr',
  rtl: 'rtl',
  paragraph: cn('block-paragraph align-middle', font.size.h4),
  code: cn(
    'block whitespace-pre-wrap ',
    'text-base text-muted-foreground',
    'px-4 py-2',
    'rounded-xl',
    'bg-backgroundCode',
    'border border-border',
    'standalone-tooltip',
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
  project,
  commit,
  document,
  placeholder = 'Start typing...',
  initialValue,
  onChange,
  onError,
  prompts,
  onRequestPromptMetadata,
  onToggleDevEditor,
  readOnlyMessage,
  autoFocus = false,
  greyTheme = false,
}: BlocksEditorProps) {
  const readOnly = Boolean(readOnlyMessage)
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
      editorState: fromBlocksToLexical(initialValue, readOnly),
      editable: !readOnly,
      onError,
      nodes: [
        CodeNode,
        MessageBlockNode,
        StepBlockNode,
        VariableNode,
        ReferenceNode,
        ImageNode,
        FileNode,
      ],
    }
  }, [readOnly, onError, initialValue])

  return (
    <BlocksEditorProvider
      currentDocument={currentDocument}
      prompts={prompts}
      readOnly={readOnly}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <div
          className={cn('relative h-full', {
            'border border-border bg-backgroundCode rounded-xl p-3':
              readOnly || greyTheme,
          })}
          ref={onRef}
        >
          <EditorReadOnlyBanner
            readOnlyMessage={readOnlyMessage}
            className='pb-3'
          />
          <RichTextPlugin
            ErrorBoundary={LexicalErrorBoundary}
            contentEditable={
              <ContentEditable
                className={cn(
                  'outline-none resize-none text-base leading-relaxed',
                  'focus:outline-none',
                  'whitespace-pre-wrap break-words',
                  VERTICAL_SPACE_CLASS,
                  {
                    'cursor-default opacity-80': readOnly,
                  },
                )}
                aria-placeholder={
                  readOnly ? readOnlyMessage || '' : placeholder
                }
                placeholder={
                  readOnly ? (
                    <div className='absolute bottom-2 text-gray-400 pointer-events-none select-none'>
                      <Text.H5
                        color='foregroundMuted'
                        textOpacity={50}
                        userSelect={false}
                      >
                        This prompt is empty
                      </Text.H5>
                    </div>
                  ) : (
                    <div className='absolute top-0 text-gray-400 pointer-events-none select-none'>
                      <Text.H5
                        color='foregroundMuted'
                        textOpacity={50}
                        userSelect={false}
                      >
                        {placeholder}
                      </Text.H5>
                    </div>
                  )
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
          {onRequestPromptMetadata && onToggleDevEditor && prompts && (
            <ReferencesPlugin
              prompts={prompts}
              onRequestPromptMetadata={onRequestPromptMetadata}
              onToggleDevEditor={onToggleDevEditor}
            />
          )}
          {onRequestPromptMetadata && (
            <ReferenceEditPlugin
              onRequestPromptMetadata={onRequestPromptMetadata}
            />
          )}
          <HierarchyValidationPlugin />
          <VariableEditPlugin />
          <VariableTransformPlugin />
          <HistoryPlugin />
          {!readOnly && floatingAnchorElem && (
            <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
          )}
          {autoFocus && <AutoFocusPlugin />}
          <OnChangeHandler onChange={onChange} />
          <SyncChangesPlugin
            project={project}
            commit={commit}
            document={document}
            readOnly={readOnly}
          />
        </div>
      </LexicalComposer>
    </BlocksEditorProvider>
  )
}
