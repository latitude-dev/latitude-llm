import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
  $getSelection,
  $isRangeSelection,
  LexicalEditor,
  $createParagraphNode,
  TextNode,
} from 'lexical'
import { useEffect, useMemo, useState } from 'react'
import { $createMessageBlockNode } from '../../nodes/MessageBlock'
import { $createStepBlockNode } from '../../nodes/StepBlock'
import { VariableNode } from '../../nodes/VariableNode'
import { IconName } from '../../../../../atoms/Icons'
import { getAllVariables } from '../VariablesMenuPlugin'

interface MenuItemOption {
  key: string
  icon?: IconName
  keywords: string[]
  onSelect: () => void
}
export class ComponentPickerOption extends MenuOption {
  title: string
  keywords: string[]
  icon?: IconName
  onSelect: (queryString: string) => void
  constructor(title: string, options: MenuItemOption) {
    super(title)
    this.title = title
    this.key = options.key
    this.icon = options.icon
    this.keywords = options.keywords
    this.onSelect = options.onSelect.bind(this)
  }
}

export type PickerGroup = {
  label?: string
  key?: string
  options: ComponentPickerOption[]
}

function getVariableOptions(editor: LexicalEditor): PickerGroup[] {
  const variables = getAllVariables(editor)
  return [
    {
      label: 'Variables',
      key: 'variables',
      options: [
        new ComponentPickerOption('Insert Variable', {
          key: 'insert_variable',
          icon: 'plus',
          keywords: ['insert', 'variable'],
          onSelect: () =>
            editor.update(() => {
              const selection = $getSelection()
              if ($isRangeSelection(selection)) {
                const initialText = !variables.length
                  ? '{{example_variable_write_your_name_between_here}}'
                  : '{{'
                const initVariable = new TextNode(initialText)
                selection.insertNodes([initVariable])
                initVariable.selectEnd()
              }
            }),
        }),
        ...variables.map((variable) => {
          return new ComponentPickerOption(variable, {
            key: variable,
            keywords: ['variable'],
            onSelect: () =>
              editor.update(() => {
                const selection = $getSelection()
                if ($isRangeSelection(selection)) {
                  const variableNode = new VariableNode(variable)
                  const spaceNode = new TextNode(' ')
                  selection.insertNodes([variableNode, spaceNode])
                }
              }),
          })
        }),
      ],
    },
  ]
}

function getDocumentsOptions(editor: LexicalEditor): PickerGroup[] {
  return [
    {
      label: 'Prompts',
      key: 'documents',
      options: [
        new ComponentPickerOption('Reference prompt (or type "@")', {
          key: 'insert_document',
          icon: 'plus',
          keywords: ['include', 'document', 'prompt'],
          onSelect: () =>
            editor.update(() => {
              const selection = $getSelection()
              if ($isRangeSelection(selection)) {
                const initVariable = new TextNode('@')
                selection.insertNodes([initVariable])
                initVariable.selectEnd()
              }
            }),
        }),
      ],
    },
  ]
}

function getGroupedOptions(editor: LexicalEditor): PickerGroup[] {
  return [
    {
      label: 'Messages',
      key: 'messages',
      options: [
        new ComponentPickerOption('System Message', {
          key: 'message_system',
          icon: 'plus',
          keywords: ['system', 'message', 'prompt'],
          onSelect: () =>
            editor.update(() => {
              const selection = $getSelection()
              if ($isRangeSelection(selection)) {
                const node = $createMessageBlockNode('system')
                const para = $createParagraphNode()
                selection.insertNodes([node, para])
                const firstChild = node.getFirstChild()
                if (firstChild) firstChild.selectEnd()
              }
            }),
        }),
        new ComponentPickerOption('Assistant Message', {
          key: 'message_assistant',
          icon: 'plus',
          keywords: ['assistant', 'message', 'ai', 'response'],
          onSelect: () =>
            editor.update(() => {
              const selection = $getSelection()
              if ($isRangeSelection(selection)) {
                const node = $createMessageBlockNode('assistant')
                const para = $createParagraphNode()
                selection.insertNodes([node, para])
                const firstChild = node.getFirstChild()
                if (firstChild) firstChild.selectEnd()
              }
            }),
        }),
        new ComponentPickerOption('User Message', {
          key: 'message_user',
          icon: 'plus',
          keywords: ['user', 'message', 'input'],
          onSelect: () =>
            editor.update(() => {
              const selection = $getSelection()
              if ($isRangeSelection(selection)) {
                const node = $createMessageBlockNode('user')
                const para = $createParagraphNode()
                selection.insertNodes([node, para])
                const firstChild = node.getFirstChild()
                if (firstChild) firstChild.selectEnd()
              }
            }),
        }),
      ],
    },
    {
      label: 'Steps',
      key: 'steps',
      options: [
        new ComponentPickerOption('Add step', {
          key: 'step',
          icon: 'plus',
          keywords: ['step', 'block', 'section'],
          onSelect: () =>
            editor.update(() => {
              const selection = $getSelection()
              if ($isRangeSelection(selection)) {
                const stepBlock = $createStepBlockNode()
                const blankParagraph = $createParagraphNode()
                selection.insertNodes([stepBlock, blankParagraph])
                const firstChild = stepBlock.getFirstChild()
                if (firstChild) firstChild.selectEnd()
              }
            }),
        }),
      ],
    },
    ...getDocumentsOptions(editor),
    ...getVariableOptions(editor),
  ]
}

export function useGroupedOptions() {
  const [editor] = useLexicalComposerContext()
  const [allGroups, setAllGroups] = useState(() => getGroupedOptions(editor))

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      setAllGroups(getGroupedOptions(editor))
    })
  }, [editor])

  return useMemo(() => ({ allGroups }), [allGroups])
}
